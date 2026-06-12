import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const generatedDir = join(root, "src", "_generated");
const dataDir = join(root, "data", "ask-corpus");
const tempDir = join(dataDir, "tmp-extract");
const outputModule = join(generatedDir, "ask-corpus.js");
const outputJson = join(dataDir, "chunks.json");
const manifestJson = join(dataDir, "manifest.json");

const corpusVersion = "2026-06-11";
const baseUrl = "https://closureresearchinitiative.org";

const htmlPages = [
  ["index.html", "Home", "/"],
  ["idea/index.html", "Foundations", "/idea/"],
  ["overview/index.html", "Overview", "/overview/"],
  ["map/index.html", "Structural Map", "/map/"],
  ["example/index.html", "Worked Example", "/example/"],
  ["notation/index.html", "Notation", "/notation/"],
  ["status/index.html", "Logical Status", "/status/"],
  ["predictions/index.html", "Predictions", "/predictions/"],
  ["guide/index.html", "Reading Guide", "/guide/"],
  ["preprints/index.html", "Preprints", "/preprints/"],
  ["sources/index.html", "Sources and Citation", "/sources/"],
  ["csm/index.html", "Closed Systems from Comparison Completeness", "/csm/"],
  ["ccw/index.html", "Closed Comparison Worlds", "/ccw/"],
  ["cfsg/index.html", "Closure Forces Spherical Geometry", "/cfsg/"],
  ["scc/index.html", "Structural Closure and the Cosmological Misnomer", "/scc/"],
  ["rc/index.html", "Rectangular Completeness Encompasses Standard Physical Closure", "/rc/"],
  ["fe/index.html", "Foundational Closure and Primitive Structural Input", "/fe/"],
  ["rie/index.html", "A Factorization Criterion for Route Invariants", "/rie/"],
  ["notes/index.html", "Research Notes", "/notes/"],
  ["license/index.html", "License", "/license/"],
  ["contact/index.html", "Contact", "/contact/"]
];

const textSources = [
  ["llms.txt", "LLMS Site Summary", "/llms.txt", "site"],
  ["external-sources.bib", "External Sources BibTeX", "/external-sources.bib", "sources"]
];

const paperSources = [
  {
    code: "csm",
    title: "Closed Systems from Comparison Completeness",
    url: "/csm/",
    kind: "monograph",
    files: listFiles(join(root, "papers", "closed-system-monograph"), ".tex")
  },
  {
    code: "ccw",
    title: "Closed Comparison Worlds and the Obstruction to Subsystem Attribution",
    url: "/ccw/",
    kind: "preprint",
    zip: "papers/closed-comparison-worlds/latex-source.zip"
  },
  {
    code: "cfsg",
    title: "Closure Forces Spherical Geometry: Genuinely Closed Three-Dimensional Systems Are Diffeomorphic to S3",
    url: "/cfsg/",
    kind: "preprint",
    zip: "papers/closure-forces-spherical-geometry/latex-source.zip"
  },
  {
    code: "scc",
    title: "Structural Closure and the Cosmological Misnomer: Admissibility, Expansion, and the Geometry of Closed Systems",
    url: "/scc/",
    kind: "preprint",
    zip: "papers/structural-closure-cosmological/latex-source.zip"
  },
  {
    code: "rc",
    title: "Rectangular Completeness Encompasses Standard Physical Closure",
    url: "/rc/",
    kind: "preprint",
    zip: "papers/rectangular-completeness/latex-source.zip"
  },
  {
    code: "fe",
    title: "Foundational Closure and Primitive Structural Input: A Four-Axis Taxonomy",
    url: "/fe/",
    kind: "preprint",
    zip: "papers/foundational/latex-source.zip"
  },
  {
    code: "rie",
    title: "A Factorization Criterion for Route Invariants with Fixed Endpoint Data",
    url: "/rie/",
    kind: "preprint",
    files: [join(root, "papers", "route-invariants-endpoint", "main.tex")]
  }
];

main();

function main() {
  mkdirSync(generatedDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  resetTempDir();

  const records = [];

  for (const [file, title, url] of htmlPages) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    records.push({
      code: slugFromUrl(url) || "home",
      kind: "site",
      title,
      url: absoluteUrl(url),
      text: htmlToText(readFileSync(path, "utf8"))
    });
  }

  for (const [file, title, url, kind] of textSources) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    records.push({
      code: file.replace(/\W+/g, "-").replace(/-$/, ""),
      kind,
      title,
      url: absoluteUrl(url),
      text: cleanPlainText(readFileSync(path, "utf8"))
    });
  }

  for (const source of paperSources) {
    const files = source.files ?? extractZipTexFiles(source.zip, source.code);
    const text = files
      .filter((file) => file.endsWith(".tex"))
      .map((file) => latexToText(readFileSync(file, "utf8")))
      .join("\n\n");

    records.push({
      code: source.code,
      kind: source.kind,
      title: source.title,
      url: absoluteUrl(source.url),
      text
    });
  }

  const chunks = [];
  for (const record of records) {
    const recordChunks = chunkText(record.text);
    recordChunks.forEach((text, index) => {
      chunks.push({
        id: `${record.code}-${String(index + 1).padStart(4, "0")}`,
        code: record.code,
        kind: record.kind,
        title: record.title,
        url: record.url,
        text
      });
    });
  }

  const manifest = {
    version: corpusVersion,
    generatedAt: new Date().toISOString(),
    records: records.map((record) => ({
      code: record.code,
      kind: record.kind,
      title: record.title,
      url: record.url
    })),
    chunks: chunks.length
  };

  writeFileSync(outputJson, `${JSON.stringify(chunks, null, 2)}\n`);
  writeFileSync(manifestJson, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(
    outputModule,
    [
      "// Generated by scripts/build-ask-corpus.mjs. Do not edit by hand.",
      `export const ASK_CORPUS_MANIFEST = ${JSON.stringify(manifest, null, 2)};`,
      `export const ASK_CORPUS = ${JSON.stringify(chunks)};`,
      ""
    ].join("\n")
  );

  rmTempDir();
  console.log(`Generated ${chunks.length} chunks in ${relative(root, outputModule)}.`);
}

function listFiles(dir, extension) {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries
    .flatMap((entry) => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) return listFiles(fullPath, extension);
      return entry.isFile() && entry.name.endsWith(extension) ? [fullPath] : [];
    })
    .sort((a, b) => a.localeCompare(b));
}

function resetTempDir() {
  const resolved = resolve(tempDir);
  if (!resolved.startsWith(resolve(dataDir))) {
    throw new Error(`Refusing to reset temp dir outside data directory: ${resolved}`);
  }
  rmTempDir();
  mkdirSync(tempDir, { recursive: true });
}

function rmTempDir() {
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function extractZipTexFiles(zipPath, code) {
  const absoluteZip = join(root, zipPath);
  const targetDir = join(tempDir, code);
  mkdirSync(targetDir, { recursive: true });
  const result = spawnSync("tar", ["-xf", absoluteZip, "-C", targetDir], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`Could not extract ${zipPath}: ${result.stderr || result.stdout}`);
  }
  return listFiles(targetDir, ".tex");
}

function absoluteUrl(url) {
  return new URL(url, baseUrl).href;
}

function slugFromUrl(url) {
  return url.replace(/^\/|\/$/g, "").replace(/\//g, "-");
}

function htmlToText(html) {
  return cleanPlainText(
    decodeEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
        .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
        .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<(h[1-6]|p|li|div|br|section|article|tr|summary|details)\b[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function latexToText(input) {
  let text = stripLatexPreamble(input).replace(/^\s*%.*$/gm, " ");
  text = text.replace(/\\(chapter|section|subsection|subsubsection|paragraph)\*?\{([^{}]+)\}/g, "\n\n$2\n\n");
  text = text.replace(/\\(title|author|date)\{([^{}]*)\}/g, "\n\n$2\n\n");
  text = text.replace(/\\(begin|end)\{[^{}]+\}/g, "\n");
  text = text.replace(/\\(label|ref|cref|Cref|cite|citep|citet|url|href)(\[[^\]]*\])?\{([^{}]*)\}/g, " $3 ");
  text = text.replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{([^{}]*)\})?/g, (_, _opt, _arg, content) => (content ? ` ${content} ` : " "));
  text = text.replace(/[{}]/g, " ");
  text = text.replace(/\$+/g, " ");
  return scrubExtractedMetadata(cleanPlainText(decodeEntities(text)));
}

function stripLatexPreamble(input) {
  const beginDocument = input.search(/\\begin\{document\}/);
  if (beginDocument === -1) return input;
  return input.slice(beginDocument).replace(/\\begin\{document\}/, " ");
}

function scrubExtractedMetadata(text) {
  const stalePersonalEmail = String.raw`chastwolfe@gm` + String.raw`ail\.com`;
  const staleMailto = new RegExp(String.raw`\bmailto:${stalePersonalEmail}\b`, "gi");
  const staleEmail = new RegExp(String.raw`\b${stalePersonalEmail}\b`, "gi");
  return text
    .replace(staleMailto, "")
    .replace(staleEmail, "chast.wolfe@closureresearchinitiative.org")
    .replace(
      /\bChast K\.~?Wolfe is an independent\s+researcher whose work concerns\b/gi,
      "Chast K. Wolfe directs the Closure Research Initiative. The work concerns"
    )
    .replace(/\bIndependent\s+researcher\b/gi, "Closure Research Initiative");
}

function decodeEntities(text) {
  const named = {
    amp: "&",
    apos: "'",
    copy: "(c)",
    gt: ">",
    hellip: "...",
    laquo: "\"",
    ldquo: "\"",
    lsquo: "'",
    lt: "<",
    mdash: "-",
    middot: "-",
    ndash: "-",
    nbsp: " ",
    quot: "\"",
    raquo: "\"",
    rdquo: "\"",
    reg: "(R)",
    rsquo: "'",
    sup3: "3"
  };

  return text
    .replace(/&([a-zA-Z0-9]+);/g, (_, name) => named[name] ?? " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function cleanPlainText(text) {
  return asciiOnly(text)
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();
}

function asciiOnly(text) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u00B7/g, "-")
    .replace(/\u00A9/g, "(c)")
    .replace(/\u00AE/g, "(R)")
    .replace(/\u00B3/g, "3")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ");
}

function chunkText(text) {
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > 1800) {
      flush();
      splitLongParagraph(paragraph).forEach((part) => chunks.push(part));
      continue;
    }

    if ((current + "\n\n" + paragraph).trim().length > 1700) {
      flush();
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }

  flush();
  return chunks
    .map((chunk) => chunk.replace(/\s+/g, " ").trim())
    .filter((chunk) => chunk.length >= 180);

  function flush() {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  }
}

function splitLongParagraph(paragraph) {
  const sentences = paragraph.split(/(?<=[.!?])\s+/);
  const parts = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + " " + sentence).trim().length > 1700 && current) {
      parts.push(current.trim());
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}
