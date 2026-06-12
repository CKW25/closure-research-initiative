import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const args = process.argv.slice(2);
const liveIndex = args.indexOf("--live");
const liveBase = liveIndex >= 0 ? normalizeBase(args[liveIndex + 1] || "https://closureresearchinitiative.org") : null;
const failures = [];
const warnings = [];

await main();

async function main() {
  checkCoreFiles();
  const wrangler = read("wrangler.toml");
  const headers = read("_headers");
  const redirects = read("_redirects");
  const siteJs = read("site.js");
  const sitemap = read("sitemap.xml");
  const feed = read("feed.xml");

  checkWrangler(wrangler);
  await checkAskCorpus(wrangler);
  checkHeaders(headers);
  checkRedirects(redirects);
  checkManifest();
  checkHtmlMetadata();
  checkSitemap(sitemap);
  checkFeed(feed);
  const downloadKeys = checkDownloadLinks(siteJs);

  if (liveBase) {
    await checkLiveBackend(liveBase, downloadKeys);
  } else {
    warnings.push("Live /api and /dl probes were skipped. Run npm run backend:check:live before release.");
  }

  for (const warning of warnings) console.warn(`WARN ${warning}`);
  if (failures.length) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exit(1);
  }

  console.log(`Backend wiring ok${liveBase ? ` against ${liveBase}` : ""}.`);
}

function checkCoreFiles() {
  [
    "wrangler.toml",
    "src/worker.js",
    "src/_generated/ask-corpus.js",
    "site.js",
    "_headers",
    "_redirects",
    "sitemap.xml",
    "feed.xml",
    "robots.txt",
    "llms.txt",
    "site.webmanifest"
  ].forEach((file) => expectFile(file));
}

function checkWrangler(text) {
  expectIncludes(text, 'main = "src/worker.js"', "wrangler main points to src/worker.js");
  expectIncludes(text, 'binding = "ASSETS"', "wrangler ASSETS binding exists");
  expectIncludes(text, 'run_worker_first = ["/api/*"]', "wrangler routes /api/* through Worker first");
  expectIncludes(text, '[ai]', "wrangler AI binding section exists");
  expectIncludes(text, 'binding = "AI"', "wrangler AI binding is named AI");
  expectIncludes(text, "ASK_MODEL", "wrangler ASK_MODEL variable exists");
  expectIncludes(text, "ASK_CORPUS_VERSION", "wrangler ASK_CORPUS_VERSION variable exists");
}

async function checkAskCorpus(wrangler) {
  const moduleUrl = pathToFileURL(join(root, "src", "_generated", "ask-corpus.js")).href;
  const module = await import(`${moduleUrl}?t=${Date.now()}`);
  const manifest = module.ASK_CORPUS_MANIFEST;
  const chunks = module.ASK_CORPUS;
  const wranglerVersion = (wrangler.match(/ASK_CORPUS_VERSION\s*=\s*"([^"]+)"/) || [])[1];

  if (!manifest || !Array.isArray(chunks)) {
    failures.push("Generated Ask corpus module does not export manifest and corpus.");
    return;
  }
  if (manifest.version !== wranglerVersion) {
    failures.push(`Ask corpus version ${manifest.version} does not match wrangler ASK_CORPUS_VERSION ${wranglerVersion}.`);
  }
  if (manifest.chunks !== chunks.length) {
    failures.push(`Ask corpus manifest chunk count ${manifest.chunks} does not match actual ${chunks.length}.`);
  }
  if (chunks.length < 700) failures.push(`Ask corpus is unexpectedly small: ${chunks.length} chunks.`);

  const requiredCodes = ["csm", "ccw", "cfsg", "scc", "rc", "fe", "rie", "notes", "llms-txt", "external-sources-bib"];
  const codes = new Set(chunks.map((chunk) => chunk.code));
  for (const code of requiredCodes) {
    if (!codes.has(code)) failures.push(`Ask corpus is missing code ${code}.`);
  }

  const notesRecord = manifest.records?.find((record) => record.code === "notes");
  if (!notesRecord || notesRecord.title !== "Research Notes") {
    failures.push("Ask corpus manifest should title the /notes/ source as Research Notes.");
  }
}

function checkHeaders(text) {
  [
    "X-Content-Type-Options: nosniff",
    "/\n  Content-Type: text/html; charset=utf-8",
    "/feed.xml\n  Content-Type: application/atom+xml; charset=utf-8",
    "/sitemap.xml\n  Content-Type: application/xml; charset=utf-8",
    "/robots.txt\n  Content-Type: text/plain; charset=utf-8",
    "/llms.txt\n  Content-Type: text/plain; charset=utf-8",
    "/external-sources.bib\n  Content-Type: application/x-bibtex; charset=utf-8",
    "/site.webmanifest\n  Content-Type: application/manifest+json; charset=utf-8"
  ].forEach((needle) => expectIncludes(text, needle, `_headers contains ${needle.split("\n")[0]}`));

  for (const route of htmlRoutes()) {
    const needle = `${route}\n  Content-Type: text/html; charset=utf-8`;
    if (!text.includes(needle)) failures.push(`_headers is missing UTF-8 HTML content type for ${route}.`);
  }
}

function checkRedirects(text) {
  [
    "/license.html /license/ 301",
    "/license /license/ 301",
    "/about.html /overview/ 301",
    "/about /overview/ 301",
    "/about/ /overview/ 301",
    "/objections.html /status/ 301",
    "/objections /status/ 301",
    "/objections/ /status/ 301"
  ].forEach((needle) => expectIncludes(text, needle, `_redirects contains ${needle}`));
}

function checkManifest() {
  const manifest = JSON.parse(read("site.webmanifest"));
  if (manifest.start_url !== "/") failures.push("site.webmanifest start_url should be /.");
  if (!Array.isArray(manifest.icons) || manifest.icons.length < 5) failures.push("site.webmanifest should declare platform icons.");
  for (const icon of manifest.icons || []) {
    if (!icon.src || !existsSync(join(root, icon.src.replace(/^\//, "")))) {
      failures.push(`Manifest icon is missing locally: ${icon.src}`);
    }
  }
}

function checkHtmlMetadata() {
  for (const file of htmlFiles()) {
    const html = read(file);
    if (!/<title>[\s\S]*?\S[\s\S]*?<\/title>/i.test(html)) failures.push(`${file} is missing a title.`);
    if (!/<meta\s+name="description"/i.test(html)) failures.push(`${file} is missing a meta description.`);
    for (const match of html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
      try {
        JSON.parse(match[1]);
      } catch (error) {
        failures.push(`${file} has invalid JSON-LD: ${error.message}`);
      }
    }
    for (const match of html.matchAll(/<a\b([^>]*)>/gi)) {
      const attrs = match[1];
      if (attrs.includes('target="_blank"') && !/rel="[^"]*noopener/i.test(attrs)) {
        failures.push(`${file} opens a new tab without rel="noopener".`);
      }
    }
    for (const match of html.matchAll(/<img\b([^>]*)>/gi)) {
      if (!/\balt="[^"]*"/i.test(match[1])) failures.push(`${file} has an image without alt text.`);
    }
  }
}

function checkSitemap(text) {
  for (const route of htmlRoutes().filter((route) => route !== "/404.html")) {
    const loc = route === "/" ? "https://closureresearchinitiative.org/" : `https://closureresearchinitiative.org${route}`;
    if (!text.includes(`<loc>${loc}</loc>`)) failures.push(`sitemap.xml is missing ${loc}.`);
  }
  ["llms.txt", "external-sources.bib", "feed.xml", "csm.pdf", "ccw.pdf", "cfsg.pdf", "scc.pdf", "rc.pdf", "fe.pdf", "rie.pdf"].forEach((item) => {
    const loc = `https://closureresearchinitiative.org/${item}`;
    if (!text.includes(`<loc>${loc}</loc>`)) failures.push(`sitemap.xml is missing ${loc}.`);
  });
}

function checkFeed(text) {
  expectIncludes(text, '<link rel="self" type="application/atom+xml" href="https://closureresearchinitiative.org/feed.xml"/>', "feed self link exists");
  ["csm.pdf", "ccw.pdf", "cfsg.pdf", "scc.pdf", "rc.pdf", "fe.pdf", "rie.pdf"].forEach((file) => {
    if (!text.includes(`https://closureresearchinitiative.org/${file}`)) failures.push(`feed.xml is missing ${file}.`);
  });
}

function checkDownloadLinks(siteJs) {
  expectIncludes(siteJs, "fetch('/dl/stats'", "site.js fetches download stats");
  const keys = new Set();
  for (const file of htmlFiles()) {
    const html = read(file);
    for (const match of html.matchAll(/["']\/dl\/([^"'?#<>\s]+)(?:[?#][^"']*)?["']/g)) {
      const key = decodeURIComponent(match[1]);
      if (key === "stats") continue;
      keys.add(key);
    }
  }

  if (!keys.size) failures.push("No /dl/ download links were found.");
  for (const key of keys) {
    if (!existsSync(join(root, key))) failures.push(`/dl/${key} points to a missing deploy asset.`);
  }
  return [...keys].sort();
}

async function checkLiveBackend(base, downloadKeys) {
  const askStatus = await readLiveJson(`${base}/api/ask-status`, "GET /api/ask-status");
  if (askStatus?.ok !== true) failures.push("Live /api/ask-status did not return ok=true.");
  if (askStatus?.aiReady !== true) failures.push("Live /api/ask-status reports aiReady=false.");
  if (!askStatus?.corpus?.version) failures.push("Live /api/ask-status corpus version is malformed.");

  const askInfo = await readLiveJson(`${base}/api/ask`, "GET /api/ask");
  if (askInfo?.name !== "Corpus Query") failures.push("Live /api/ask did not identify Corpus Query.");
  if (askInfo?.corpus?.version !== askStatus?.corpus?.version) failures.push("Live /api/ask corpus version differs from /api/ask-status.");
  const notesRecord = askInfo?.corpus?.records?.find((record) => record.code === "notes");
  if (!notesRecord || notesRecord.title !== "Research Notes") failures.push("Live Ask manifest does not expose Research Notes for /notes/.");

  const emptyQuestion = await fetch(`${base}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "" })
  });
  if (emptyQuestion.status !== 400) failures.push(`Live POST /api/ask empty-question validation returned ${emptyQuestion.status}, expected 400.`);

  const options = await fetch(`${base}/api/ask`, { method: "OPTIONS" });
  if (options.status !== 204) failures.push(`Live OPTIONS /api/ask returned ${options.status}, expected 204.`);

  const unknown = await fetch(`${base}/api/not-a-route`);
  if (unknown.status !== 404) failures.push(`Live unknown API route returned ${unknown.status}, expected 404.`);

  const stats = await readLiveJson(`${base}/dl/stats`, "GET /dl/stats");
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) failures.push("Live /dl/stats did not return a JSON object.");
  for (const key of downloadKeys) {
    if (!Object.prototype.hasOwnProperty.call(stats || {}, key) && !key.startsWith("archive/")) {
      warnings.push(`Live /dl/stats has no count yet for /dl/${key}; site.js will display 0.`);
    }
  }

  for (const asset of ["csm.pdf", "ccw.pdf", "feed.xml", "sitemap.xml", "llms.txt", "site.webmanifest"]) {
    const response = await fetch(`${base}/${asset}`, { method: "HEAD" });
    if (!response.ok) failures.push(`Live /${asset} returned ${response.status}.`);
  }
}

async function readLiveJson(url, label) {
  const response = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
  if (!response.ok) {
    failures.push(`${label} returned ${response.status}.`);
    return null;
  }
  const type = response.headers.get("content-type") || "";
  if (!type.toLowerCase().includes("json")) failures.push(`${label} returned non-JSON content type ${type}.`);
  try {
    return await response.json();
  } catch (error) {
    failures.push(`${label} returned invalid JSON: ${error.message}`);
    return null;
  }
}

function htmlFiles() {
  const files = [];
  walk(root, files);
  return files
    .map((file) => relative(root, file).replace(/\\/g, "/"))
    .filter((file) => file.endsWith(".html"))
    .sort();
}

function htmlRoutes() {
  return htmlFiles()
    .map((file) => {
      if (file === "index.html") return "/";
      if (file.endsWith("/index.html")) return `/${file.slice(0, -"index.html".length)}`;
      return `/${file}`;
    })
    .sort();
}

function walk(dir, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", ".wrangler", ".wrangler-dry-run"].includes(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else files.push(fullPath);
  }
}

function normalizeBase(value) {
  return String(value || "").replace(/\/+$/, "");
}

function expectFile(file) {
  if (!existsSync(join(root, file))) failures.push(`Missing required backend file: ${file}.`);
}

function read(file) {
  return readFileSync(join(root, file), "utf8");
}

function expectIncludes(text, needle, label) {
  if (!text.includes(needle)) failures.push(label);
}
