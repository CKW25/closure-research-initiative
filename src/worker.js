import { ASK_CORPUS, ASK_CORPUS_MANIFEST } from "./_generated/ask-corpus.js";

const MODEL_FALLBACK = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MODEL_SECONDARY = "@cf/meta/llama-3.1-8b-instruct-fast";
const MAX_QUESTION_LENGTH = 1400;
const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_CHARS = 1800;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_REQUESTS = 20;
const RESPONSE_CACHE_TTL_MS = 6 * 60 * 1000;
const RESPONSE_CACHE_LIMIT = 50;
const BM25_K1 = 1.35;
const BM25_B = 0.72;
const buckets = new Map();
const responseCache = new Map();
const VALID_MODES = new Set(["discuss", "guide", "locate", "cite"]);

const STOPWORDS = new Set([
  "about", "above", "after", "again", "against", "also", "and", "are", "because", "been",
  "being", "between", "both", "but", "can", "could", "does", "doing", "down", "each",
  "from", "had", "has", "have", "how", "into", "its", "just", "more", "most", "not",
  "only", "other", "our", "out", "over", "own", "same", "should", "some", "such",
  "than", "that", "the", "their", "then", "there", "these", "they", "this", "those",
  "through", "too", "under", "was", "were", "what", "when", "where", "which", "while",
  "who", "why", "with", "would", "you", "your"
]);

const SEARCH_INDEX = ASK_CORPUS.map((chunk, index) => {
  const haystack = `${chunk.code} ${chunk.kind} ${chunk.title} ${chunk.text}`.toLowerCase();
  const tokens = tokenize(haystack);
  const counts = termCounts(tokens);
  return {
    chunk,
    index,
    haystack,
    tokens,
    counts,
    length: Math.max(1, tokens.length),
    titleTokens: new Set(tokenize(chunk.title)),
    labels: extractLabels(`${chunk.title} ${chunk.text}`)
  };
});
const CHUNKS_BY_ID = new Map(SEARCH_INDEX.map((item) => [item.chunk.id, item]));
const DOC_FREQ = documentFrequencies(SEARCH_INDEX);
const AVG_DOC_LENGTH = SEARCH_INDEX.reduce((sum, item) => sum + item.length, 0) / Math.max(1, SEARCH_INDEX.length);

const HIDDEN_CONTEXT_CODES = new Set(["llms-txt"]);

const TERM_ALIASES = new Map([
  ["s3", ["spherical", "geometry", "three-dimensional", "closed"]],
  ["sphere", ["spherical", "s3"]],
  ["spherical", ["s3", "geometry"]],
  ["charge", ["electromagnetic", "denominator-3", "prediction"]],
  ["millicharged", ["charge", "denominator-3", "prediction"]],
  ["prediction", ["charge", "denominator-3", "particle"]],
  ["rectangular", ["completeness", "product", "profile"]],
  ["completeness", ["rectangular", "comparison", "closure"]],
  ["cite", ["citation", "bibtex", "doi"]],
  ["citation", ["cite", "bibtex", "doi"]],
  ["doi", ["zenodo", "citation"]],
  ["ccw", ["closed", "comparison", "worlds"]],
  ["csm", ["closed", "systems", "comparison", "completeness"]],
  ["cfsg", ["closure", "forces", "spherical", "geometry"]],
  ["scc", ["structural", "closure", "cosmological"]],
  ["rie", ["route", "invariants", "endpoint"]],
  ["rc", ["rectangular", "completeness", "physical", "closure"]],
  ["fe", ["foundational", "closure", "primitive", "structural"]]
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ask" && request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: commonHeaders() });
    }

    if (url.pathname === "/api/ask" && request.method === "GET") {
      return json({
        ok: true,
        name: "CRI Research Assistant",
        corpus: responseManifest(),
        endpoint: "POST /api/ask"
      });
    }

    if (url.pathname === "/api/ask-status" && request.method === "GET") {
      return json({
        ok: true,
        aiReady: !!env.AI && typeof env.AI.run === "function",
        model: env.ASK_MODEL || MODEL_FALLBACK,
        corpus: responseManifest(),
        note: env.AI ? "Workers AI binding is available." : "Workers AI binding is not available in this environment."
      });
    }

    if (url.pathname === "/api/ask" && request.method === "POST") {
      return handleAsk(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "not_found", message: "Unknown API route." }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleAsk(request, env) {
  const rate = rateLimit(clientId(request));
  if (!rate.ok) {
    return json(
      {
        error: "rate_limited",
        message: "The public assistant is receiving too many requests from this connection. Please try again shortly.",
        retryAfterSeconds: Math.ceil(rate.retryAfterMs / 1000)
      },
      429,
      { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request", message: "Expected a JSON body." }, 400);
  }

  const question = normalizeQuestion(body?.question);
  if (!question) {
    return json({ error: "empty_question", message: "Enter a question about the Closure corpus." }, 400);
  }

  if (question.length > MAX_QUESTION_LENGTH) {
    return json(
      {
        error: "question_too_long",
        message: `Questions are limited to ${MAX_QUESTION_LENGTH} characters.`
      },
      400
    );
  }

  const mode = normalizeMode(body?.mode);
  const history = normalizeHistory(body?.history);
  const cacheKey = cacheKeyFor(question, mode, history);
  const cached = readCachedAnswer(cacheKey);
  if (cached) return json({ ...cached, cached: true });

  const matches = findMatches(question, 18, mode, history);
  const terms = queryTerms(searchText(question, history));
  const visibleMatches = matches.filter((match) => !isHiddenContext(match.chunk)).slice(0, 10);
  const hiddenMatches = matches.filter((match) => isHiddenContext(match.chunk)).slice(0, 3);
  const citations = visibleMatches.map((match, index) => citationFor(match.chunk, index + 1, match.score, terms));
  const hiddenContext = hiddenMatches.map((match, index) => hiddenContextFor(match.chunk, index + 1, match.score, terms));

  if (!citations.length) {
    return json({
      answer: "I found orientation material in the corpus, but not enough public-facing source material to cite for that question. Try naming the paper, theorem topic, or phrase used on the site.",
      citations: [],
      corpus: responseCorpus(),
      mode,
      suggestions: defaultSuggestions(mode),
      retrieval: "local-hybrid"
    });
  }

  if (!env.AI || typeof env.AI.run !== "function") {
    return json(
      {
        error: "ai_binding_missing",
        message: "Workers AI is not enabled for this deployment yet. The corpus search is ready, but answer generation needs the Cloudflare AI binding.",
        citations,
        corpus: responseCorpus(),
        mode,
        suggestions: suggestionsFor(question, mode, citations),
        retrieval: "local-hybrid"
      },
      503
    );
  }

  const prompt = buildPrompt(question, citations, hiddenContext, mode, history);
  let answer;
  let model = env.ASK_MODEL || MODEL_FALLBACK;
  try {
    const result = await runAnswerModel(env, model, prompt, mode);
    answer = cleanAnswerText(extractText(result));
  } catch (error) {
    if (model !== MODEL_SECONDARY) {
      try {
        model = MODEL_SECONDARY;
        const result = await runAnswerModel(env, model, prompt, mode);
        answer = cleanAnswerText(extractText(result));
      } catch (fallbackError) {
        return generationFailed(fallbackError, citations, mode);
      }
    } else {
      return generationFailed(error, citations, mode);
    }
  }

  const payload = {
    answer: answer || "I could not generate a stable answer from the retrieved corpus excerpts.",
    citations,
    corpus: responseCorpus(),
    mode,
    model,
    suggestions: suggestionsFor(question, mode, citations),
    retrieval: "local-hybrid"
  };
  writeCachedAnswer(cacheKey, payload);
  return json(payload);
}

function runAnswerModel(env, model, prompt, mode) {
  return env.AI.run(model, {
    messages: prompt,
    temperature: mode === "discuss" ? 0.26 : 0.08,
    max_tokens: mode === "discuss" ? 1350 : 980
  });
}

function generationFailed(error, citations, mode) {
  return json(
    {
      error: "ai_generation_failed",
      message: "The corpus search succeeded, but the answer model did not return a response.",
      detail: safeError(error),
      citations,
      corpus: responseCorpus(),
      mode,
      suggestions: defaultSuggestions(mode),
      retrieval: "local-hybrid"
    },
    502
  );
}

function normalizeQuestion(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeMode(value) {
  if (value === "guide") return "discuss";
  return VALID_MODES.has(value) ? value : "discuss";
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({
      role: turn?.role === "assistant" ? "assistant" : "user",
      content: normalizeQuestion(turn?.content).slice(0, 700)
    }))
    .filter((turn) => turn.content)
    .reduce((acc, turn) => {
      const used = acc.reduce((sum, item) => sum + item.content.length, 0);
      if (used >= MAX_HISTORY_CHARS) return acc;
      acc.push({ ...turn, content: turn.content.slice(0, Math.max(0, MAX_HISTORY_CHARS - used)) });
      return acc;
    }, []);
}

function clientId(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
}

function rateLimit(id) {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  const bucket = buckets.get(id) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  bucket.count += 1;
  buckets.set(id, bucket);

  if (bucket.count > RATE_LIMIT_REQUESTS) {
    return { ok: false, retryAfterMs: bucket.resetAt - now };
  }
  return { ok: true };
}

function searchText(question, history = []) {
  const recentUserContext = history
    .filter((turn) => turn.role === "user")
    .slice(-2)
    .map((turn) => turn.content)
    .join(" ");
  return `${question} ${recentUserContext}`.trim();
}

function findMatches(question, limit, mode = "discuss", history = []) {
  const search = searchText(question, history);
  const terms = queryTerms(search);
  if (!terms.length) return [];
  const phrase = question.toLowerCase();
  const pairs = adjacentPairs(terms);
  const labels = extractLabels(search);
  const scored = [];

  for (const item of SEARCH_INDEX) {
    let score = scoreChunk(item, terms, pairs, labels, phrase, mode);
    if (!score) continue;

    score *= kindWeight(item.chunk.kind, mode);
    score += modeBoost(item.chunk, mode);
    scored.push({ chunk: item.chunk, score });
  }

  return addNeighborContext(selectTopMatches(scored, Math.min(12, limit)), limit);
}

function scoreChunk(item, terms, pairs, labels, phrase, mode) {
  let score = 0;
  let matchedTerms = 0;

  for (const term of terms) {
    const tf = item.counts.get(term) || 0;
    if (tf) {
      matchedTerms += 1;
      score += idf(term) * bm25(tf, item.length);
      if (item.titleTokens.has(term)) score += 4.2;
      if (item.chunk.code === term) score += 7;
    } else if (item.chunk.code === term) {
      score += 5.5;
    }
  }

  for (const pair of pairs) {
    if (item.haystack.includes(pair)) score += 3.5;
    if (item.chunk.title.toLowerCase().includes(pair)) score += 7;
  }

  for (const label of labels) {
    if (item.labels.has(label) || item.haystack.includes(label)) score += 24;
  }

  if (phrase.length > 12 && item.haystack.includes(phrase)) score += 18;
  if (matchedTerms > 1) score += Math.min(9, matchedTerms * 1.4);
  if (mode === "discuss" && (item.chunk.kind === "monograph" || item.chunk.kind === "preprint")) score += 1.5;
  return score;
}

function bm25(tf, length) {
  return ((tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * (length / AVG_DOC_LENGTH))));
}

function idf(term) {
  const df = DOC_FREQ.get(term) || 0;
  return Math.log(1 + (SEARCH_INDEX.length - df + 0.5) / (df + 0.5));
}

function selectTopMatches(scored, limit) {
  const perCode = new Map();
  return scored
    .sort((a, b) => b.score - a.score)
    .filter((match) => {
      const count = perCode.get(match.chunk.code) || 0;
      if (count >= 3) return false;
      perCode.set(match.chunk.code, count + 1);
      return true;
    })
    .slice(0, limit);
}

function addNeighborContext(matches, limit) {
  const selected = [];
  const seen = new Set();

  const add = (match) => {
    if (!match || seen.has(match.chunk.id) || selected.length >= limit) return;
    seen.add(match.chunk.id);
    selected.push(match);
  };

  for (const match of matches) add(match);

  for (const match of matches.slice(0, 6)) {
    if (selected.length >= limit) break;
    if (match.chunk.kind !== "monograph" && match.chunk.kind !== "preprint") continue;
    for (const offset of [-1, 1]) {
      const neighbor = neighborMatch(match, offset);
      if (neighbor) add(neighbor);
    }
  }

  return selected.slice(0, limit);
}

function neighborMatch(match, offset) {
  const parts = match.chunk.id.match(/^(.+)-(\d{4})$/);
  if (!parts) return null;
  const neighborId = `${parts[1]}-${String(Number(parts[2]) + offset).padStart(4, "0")}`;
  const item = CHUNKS_BY_ID.get(neighborId);
  if (!item || item.chunk.code !== match.chunk.code) return null;
  return { chunk: item.chunk, score: Number((match.score * 0.62).toFixed(3)) };
}

function queryTerms(question) {
  const terms = tokenize(question)
    .filter((term) => term.length > 2 && !STOPWORDS.has(term));
  const expanded = [];
  for (const term of terms) {
    expanded.push(term);
    for (const alias of TERM_ALIASES.get(term) || []) expanded.push(alias);
  }
  return Array.from(new Set(expanded)).slice(0, 28);
}

function adjacentPairs(terms) {
  const pairs = [];
  for (let index = 0; index < terms.length - 1; index += 1) {
    pairs.push(`${terms[index]} ${terms[index + 1]}`);
  }
  return pairs;
}

function kindWeight(kind, mode) {
  if (mode === "cite") {
    if (kind === "sources") return 1.45;
    if (kind === "preprint" || kind === "monograph") return 1.18;
    return 0.85;
  }
  if (mode === "locate") return 1;
  if (mode === "discuss" && kind === "site") return 0.95;
  if (kind === "monograph" || kind === "preprint") return 1.12;
  return 1;
}

function modeBoost(chunk, mode) {
  const haystack = `${chunk.title} ${chunk.text}`.toLowerCase();
  if (mode === "cite" && /\b(bibtex|doi|zenodo|orcid|citation|cite)\b/.test(haystack)) return 8;
  if (mode === "locate" && (chunk.kind === "site" || chunk.kind === "preprint" || chunk.kind === "monograph")) return 2;
  return 0;
}

function countOccurrences(text, term) {
  let count = 0;
  let index = text.indexOf(term);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(term, index + term.length);
  }
  return count;
}

function tokenize(value) {
  return (String(value || "").toLowerCase().match(/[a-z0-9][a-z0-9-]{1,}/g) || [])
    .map((term) => term.replace(/^-+|-+$/g, ""))
    .filter(Boolean);
}

function termCounts(tokens) {
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return counts;
}

function documentFrequencies(index) {
  const frequencies = new Map();
  for (const item of index) {
    for (const term of item.counts.keys()) frequencies.set(term, (frequencies.get(term) || 0) + 1);
  }
  return frequencies;
}

function extractLabels(value) {
  const labels = new Set();
  for (const match of String(value || "").toLowerCase().matchAll(/\b(?:ch|sec|thm|def|lem|prop|cor|rem):[a-z0-9_-]+/g)) {
    labels.add(match[0]);
  }
  return labels;
}

function citationFor(chunk, number, score, terms = []) {
  return {
    id: `S${number}`,
    title: chunk.title,
    url: chunk.url,
    code: chunk.code,
    kind: chunk.kind,
    score: Number(score.toFixed(3)),
    locator: chunk.id,
    excerpt: excerpt(chunk.text, terms)
  };
}

function hiddenContextFor(chunk, number, score, terms = []) {
  return {
    id: `I${number}`,
    title: chunk.title,
    code: chunk.code,
    kind: chunk.kind,
    score: Number(score.toFixed(3)),
    excerpt: excerpt(chunk.text, terms)
  };
}

function isHiddenContext(chunk) {
  return HIDDEN_CONTEXT_CODES.has(chunk.code);
}

function excerpt(text, terms = []) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const maxLength = 900;
  if (cleaned.length <= maxLength) return cleaned;

  const lower = cleaned.toLowerCase();
  const termIndex = terms
    .map((term) => lower.indexOf(term.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (termIndex === undefined) return `${cleaned.slice(0, maxLength).trim()}...`;

  const start = Math.max(0, termIndex - Math.floor(maxLength * 0.35));
  const end = Math.min(cleaned.length, start + maxLength);
  const prefix = start > 0 ? "... " : "";
  const suffix = end < cleaned.length ? " ..." : "";
  return `${prefix}${cleaned.slice(start, end).trim()}${suffix}`;
}

function buildPrompt(question, citations, hiddenContext, mode, history) {
  const publicContext = citations
    .map((citation) => `[${citation.id}] ${citation.title}\nURL: ${citation.url}\nExcerpt: ${citation.excerpt}`)
    .join("\n\n");
  const orientationContext = hiddenContext.length
    ? hiddenContext
        .map((source) => `[${source.id}] ${source.title}\nInternal note: ${source.excerpt}`)
        .join("\n\n")
    : "No internal orientation excerpts retrieved.";
  const conversation = history.length
    ? history.map((turn) => `${turn.role === "assistant" ? "Assistant" : "User"}: ${turn.content}`).join("\n")
    : "No prior turns in this session.";
  const modeInstruction = modeInstructions(mode);

  return [
    {
      role: "system",
      content: [
        "You are the CRI Research Assistant, a source-bound conversational guide for closureresearchinitiative.org.",
        "You may speak directly to the reader in a calm, clear, technically serious voice.",
        "Use the conversation history only to understand follow-up references; use the retrieved excerpts as the sole authority for factual claims.",
        "Answer only from the supplied excerpts. Do not use outside knowledge or unstated assumptions.",
        "Cite substantive claims with public bracketed source labels such as [S1] or [S2]; a citation may support a full sentence or paragraph.",
        "Internal orientation excerpts are labeled [I1], [I2], and so on. Use them only to understand the site structure or choose public sources.",
        "Never cite, quote, recommend, or mention internal orientation labels, LLMS Site Summary, or llms.txt in the final answer.",
        "If the excerpts support a weaker claim than the question asks for, state the weaker supported claim and name the missing support.",
        "If the excerpts do not support the answer, say that the retrieved corpus excerpts do not contain enough support.",
        "Do not invent theorem numbers, page numbers, URLs, paper titles, claims, or citations.",
        "Prefer useful synthesis over a string of excerpts, but keep every synthesis traceable to the source labels.",
        "Use concise Markdown when it improves readability: short paragraphs, bullets for dependencies, and bold labels sparingly.",
        modeInstruction
      ].join(" ")
    },
    {
      role: "user",
      content: [
        `Mode: ${mode}`,
        `Recent conversation:\n${conversation}`,
        `Current question: ${question}`,
        `Public source excerpts for citation:\n${publicContext}`,
        `Internal orientation excerpts, not for citation:\n${orientationContext}`
      ].join("\n\n")
    }
  ];
}

function modeInstructions(mode) {
  if (mode === "locate") {
    return [
      "For locate mode, act like a source locator.",
      "Start with the best place to read, then list the most relevant source labels with one-sentence reasons.",
      "Do not over-explain the theory unless needed to distinguish locations."
    ].join(" ");
  }
  if (mode === "cite") {
    return [
      "For cite mode, prioritize canonical citation details, DOI or URL evidence, and which work should be cited for which claim.",
      "If the retrieved excerpts do not include a full citation field, say so instead of filling it in from memory."
    ].join(" ");
  }
  return [
    "For discuss mode, answer as a patient technical interlocutor rather than a search-result snippet.",
    "Begin with the direct answer, then give the proof/status/dependency structure only as far as the retrieved excerpts support it.",
    "When helpful, end with a brief next-reading route through the cited public sources."
  ].join(" ");
}

function extractText(result) {
  if (typeof result === "string") return result.trim();
  if (typeof result?.response === "string") return result.response.trim();
  if (typeof result?.result?.response === "string") return result.result.response.trim();
  if (Array.isArray(result?.choices) && typeof result.choices[0]?.message?.content === "string") {
    return result.choices[0].message.content.trim();
  }
  return "";
}

function cleanAnswerText(value) {
  const text = String(value || "").trim();
  const publicLines = text
    .split(/\n+/)
    .filter((line) => !/\[I\d+\]|\bLLMS Site Summary\b|\bllms\.txt\b/i.test(line));
  const cleaned = (publicLines.length ? publicLines.join("\n") : text)
    .replace(/\s*\[I\d+\]/g, "")
    .replace(/\baccording to (?:the )?(?:LLMS Site Summary|llms\.txt),?\s*/gi, "")
    .replace(/\b(?:LLMS Site Summary|llms\.txt)\b/gi, "");
  return cleaned
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function responseCorpus() {
  return {
    version: ASK_CORPUS_MANIFEST.version,
    chunks: ASK_CORPUS_MANIFEST.chunks,
    retrieval: "static-hybrid"
  };
}

function responseManifest() {
  return {
    ...ASK_CORPUS_MANIFEST,
    retrieval: "static-hybrid"
  };
}

function suggestionsFor(question, mode, citations) {
  const text = question.toLowerCase();
  if (mode === "cite") {
    return [
      "Which work should I cite for the main theorem?",
      "Give me the BibTeX for the current version.",
      "Which claims have DOI records now?"
    ];
  }
  if (mode === "locate") {
    return [
      "Summarize the result at the strongest location.",
      "What depends on this result?",
      "Which paper should I open first?"
    ];
  }
  if (/\bs3\b|s\^3|sphere|spherical|geometry/.test(text)) {
    return [
      "Is S3 assumed or derived?",
      "What hypotheses are needed for the S3 conclusion?",
      "Where is frame completeness used?"
    ];
  }
  if (/rectangular|completeness|product/.test(text)) {
    return [
      "What does rectangular completeness rule out?",
      "Where is this proved in the monograph?",
      "How does this relate to standard physical closure?"
    ];
  }
  if (/charge|millicharged|prediction|denominator/.test(text)) {
    return [
      "State the prediction as a falsifiable claim.",
      "Where is the denominator-3 lattice defined?",
      "Which source should be cited for this prediction?"
    ];
  }
  if (citations.some((citation) => citation.code === "csm")) {
    return [
      "What is the exact logical status of this claim?",
      "Where does the proof enter the monograph?",
      "What are the needed hypotheses?"
    ];
  }
  return defaultSuggestions(mode);
}

function defaultSuggestions(mode) {
  if (mode === "locate") return ["Open the best source.", "Explain this result.", "Show related dependencies."];
  if (mode === "cite") return ["Give canonical citations.", "Show DOI records.", "Which version should be cited?"];
  return [
    "What is the exact logical status?",
    "Where is this proved?",
    "How does this connect to the rest of the program?"
  ];
}

function cacheKeyFor(question, mode, history) {
  const historyText = history.map((turn) => `${turn.role}:${turn.content}`).join("|");
  return `${mode}|${question.toLowerCase()}|${historyText}`.slice(0, 2600);
}

function readCachedAnswer(key) {
  const item = responseCache.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return item.payload;
}

function writeCachedAnswer(key, payload) {
  responseCache.set(key, { payload, expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS });
  while (responseCache.size > RESPONSE_CACHE_LIMIT) {
    responseCache.delete(responseCache.keys().next().value);
  }
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 300);
}

function commonHeaders(extra = {}) {
  return {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...extra
  };
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: commonHeaders(extraHeaders)
  });
}
