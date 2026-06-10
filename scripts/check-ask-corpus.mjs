import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const modulePath = join(root, "src", "_generated", "ask-corpus.js");

if (!existsSync(modulePath)) {
  throw new Error("Missing src/_generated/ask-corpus.js. Run npm run ask:corpus first.");
}

const source = readFileSync(modulePath, "utf8");
const corpusMatch = source.match(/export const ASK_CORPUS = (.*);/s);
const manifestMatch = source.match(/export const ASK_CORPUS_MANIFEST = ([\s\S]*?);\nexport const ASK_CORPUS = /);

if (!corpusMatch || !manifestMatch) {
  throw new Error("Generated corpus module has an unexpected shape.");
}

const manifest = JSON.parse(manifestMatch[1]);
const chunks = JSON.parse(corpusMatch[1]);
const requiredCodes = ["csm", "ccw", "cfsg", "scc", "rc", "fe", "rie"];
const presentCodes = new Set(chunks.map((chunk) => chunk.code));
const missing = requiredCodes.filter((code) => !presentCodes.has(code));

if (missing.length) {
  throw new Error(`Generated corpus is missing required works: ${missing.join(", ")}`);
}

if (chunks.length < 100) {
  throw new Error(`Generated corpus is unexpectedly small: ${chunks.length} chunks.`);
}

for (const chunk of chunks) {
  if (!chunk.id || !chunk.title || !chunk.url || !chunk.text) {
    throw new Error(`Malformed chunk: ${JSON.stringify(chunk).slice(0, 200)}`);
  }
  if (chunk.text.length > 2200) {
    throw new Error(`Chunk ${chunk.id} is too long: ${chunk.text.length} characters.`);
  }
}

console.log(`Ask corpus ok: ${chunks.length} chunks, version ${manifest.version}.`);
