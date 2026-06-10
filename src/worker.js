import { ASK_CORPUS, ASK_CORPUS_MANIFEST } from "./_generated/ask-corpus.js";

const MODEL_FALLBACK = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MODEL_SECONDARY = "@cf/meta/llama-3.1-8b-instruct-fast";
const MAX_QUESTION_LENGTH = 1400;
const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_CHARS = 1800;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_REQUESTS = 20;
const buckets = new Map();
const VALID_MODES = new Set(["guide", "locate", "cite"]);

const STOPWORDS = new Set([
  "about", "above", "after", "again", "against", "also", "and", "are", "because", "been",
  "being", "between", "both", "but", "can", "could", "does", "doing", "down", "each",
  "from", "had", "has", "have", "how", "into", "its", "just", "more", "most", "not",
  "only", "other", "our", "out", "over", "own", "same", "should", "some", "such",
  "than", "that", "the", "their", "then", "there", "these", "they", "this", "those",
  "through", "too", "under", "was", "were", "what", "when", "where", "which", "while",
  "who", "why", "with", "would", "you", "your"
]);

const SEARCH_INDEX = ASK_CORPUS.map((chunk) => ({
  chunk,
  haystack: `${chunk.code} ${chunk.kind} ${chunk.title} ${chunk.text}`.toLowerCase()
}));

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
        name: "Corpus Query",
        corpus: ASK_CORPUS_MANIFEST,
        endpoint: "POST /api/ask"
      });
    }

    if (url.pathname === "/api/ask-status" && request.method === "GET") {
      return json({
        ok: true,
        aiReady: !!env.AI && typeof env.AI.run === "function",
        model: env.ASK_MODEL || MODEL_FALLBACK,
        corpus: ASK_CORPUS_MANIFEST,
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
  const matches = findMatches(question, 16, mode, history);
  const terms = queryTerms(searchText(question, history));
  const visibleMatches = matches.filter((match) => !isHiddenContext(match.chunk)).slice(0, 12);
  const hiddenMatches = matches.filter((match) => isHiddenContext(match.chunk)).slice(0, 3);
  const citations = visibleMatches.map((match, index) => citationFor(match.chunk, index + 1, match.score, terms));
  const hiddenContext = hiddenMatches.map((match, index) => hiddenContextFor(match.chunk, index + 1, match.score, terms));

  if (!citations.length) {
    return json({
      answer: "I found orientation material in the corpus, but not enough public-facing source material to cite for that question. Try naming the paper, theorem topic, or phrase used on the site.",
      citations: [],
      corpus: responseCorpus(),
      mode,
      retrieval: "local-lexical"
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
        retrieval: "local-lexical"
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

  return json({
    answer: answer || "I could not generate a stable answer from the retrieved corpus excerpts.",
    citations,
    corpus: responseCorpus(),
    mode,
    model,
    retrieval: "local-lexical"
  });
}

function runAnswerModel(env, model, prompt, mode) {
  return env.AI.run(model, {
    messages: prompt,
    temperature: mode === "guide" ? 0.22 : 0.08,
    max_tokens: mode === "guide" ? 1180 : 980
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
      retrieval: "local-lexical"
    },
    502
  );
}

function normalizeQuestion(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeMode(value) {
  return VALID_MODES.has(value) ? value : "guide";
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

function findMatches(question, limit, mode = "guide", history = []) {
  const terms = queryTerms(searchText(question, history));
  if (!terms.length) return [];
  const phrase = question.toLowerCase();
  const pairs = adjacentPairs(terms);
  const scored = [];

  for (const item of SEARCH_INDEX) {
    let score = 0;
    const title = item.chunk.title.toLowerCase();
    for (const term of terms) {
      const occurrences = countOccurrences(item.haystack, term);
      if (!occurrences) continue;
      score += occurrences;
      if (title.includes(term)) score += 4;
      if (item.chunk.code === term) score += 5;
    }

    for (const pair of pairs) {
      if (item.haystack.includes(pair)) score += 3;
      if (title.includes(pair)) score += 6;
    }

    if (phrase.length > 12 && item.haystack.includes(phrase)) score += 12;
    if (!score) continue;

    score *= kindWeight(item.chunk.kind, mode);
    score += modeBoost(item.chunk, mode);
    score = score / Math.sqrt(Math.max(1, item.chunk.text.length / 900));
    scored.push({ chunk: item.chunk, score });
  }

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

function queryTerms(question) {
  const raw = question.toLowerCase().match(/[a-z0-9][a-z0-9-]{1,}/g) || [];
  const terms = raw
    .map((term) => term.replace(/^-+|-+$/g, ""))
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

function citationFor(chunk, number, score, terms = []) {
  return {
    id: `S${number}`,
    title: chunk.title,
    url: chunk.url,
    code: chunk.code,
    kind: chunk.kind,
    score: Number(score.toFixed(3)),
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
  const maxLength = 1150;
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
        "You are the Corpus Query interface, a bounded scholarly guide for closureresearchinitiative.org.",
        "You may speak directly to the reader in a calm, clear, conversational academic voice.",
        "Use the conversation history only to understand follow-up references; use the retrieved excerpts as the sole authority for factual claims.",
        "Answer only from the supplied excerpts. Do not use outside knowledge or unstated assumptions.",
        "Cite every substantive claim with public bracketed source labels such as [S1] or [S2].",
        "Internal orientation excerpts are labeled [I1], [I2], and so on. Use them only to understand the site structure or choose public sources.",
        "Never cite, quote, recommend, or mention internal orientation labels, LLMS Site Summary, or llms.txt in the final answer.",
        "If the excerpts support a weaker claim than the question asks for, state the weaker supported claim and name the missing support.",
        "If the excerpts do not support the answer, say that the retrieved corpus excerpts do not contain enough support.",
        "Do not invent theorem numbers, page numbers, URLs, paper titles, claims, or citations.",
        "Prefer useful synthesis over a string of excerpts, but keep every synthesis traceable to the source labels.",
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
    "For guide mode, begin with a short direct answer, then add the careful version.",
    "When helpful, end with a brief reading route through the cited sources.",
    "The tone should feel like a rigorous research guide, not a search-result snippet."
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
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const publicSentences = sentences.filter((sentence) => !/\[I\d+\]|\bLLMS Site Summary\b|\bllms\.txt\b/i.test(sentence));
  const cleaned = (publicSentences.length ? publicSentences.join(" ") : text)
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
    chunks: ASK_CORPUS_MANIFEST.chunks
  };
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
