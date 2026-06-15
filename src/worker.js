import { ASK_CORPUS, ASK_CORPUS_MANIFEST } from "./_generated/ask-corpus.js";

const MODEL_FALLBACK = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MODEL_SECONDARY = "@cf/meta/llama-3.1-8b-instruct-fast";
const MAX_QUESTION_LENGTH = 1400;
const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_CHARS = 1800;
const MAX_CONTEXTUAL_ASSISTANT_CHARS = 900;
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
  const previousSuggestions = normalizeSuggestions(body?.previousSuggestions);
  const cacheKey = cacheKeyFor(question, mode, history, previousSuggestions);
  const cached = readCachedAnswer(cacheKey);
  if (cached) return json({ ...cached, cached: true });

  const search = searchText(question, history);
  const matches = findMatches(question, 18, mode, history);
  const terms = queryTerms(search);
  const visibleMatches = matches.filter((match) => !isHiddenContext(match.chunk)).slice(0, 10);
  const hiddenMatches = matches.filter((match) => isHiddenContext(match.chunk)).slice(0, 3);
  const citations = visibleMatches.map((match, index) => citationFor(match.chunk, index + 1, match.score, terms));
  const hiddenContext = hiddenMatches.map((match, index) => hiddenContextFor(match.chunk, index + 1, match.score, terms));

  if (!citations.length) {
    return json({
      answer: noCitationAnswer(question, history),
      citations: [],
      corpus: responseCorpus(),
      mode,
      suggestions: defaultSuggestions(mode, history, previousSuggestions),
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
        suggestions: suggestionsFor(question, mode, citations, "", history, previousSuggestions),
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
    answer = finalizeAnswerText(extractText(result), citations);
  } catch (error) {
    if (model !== MODEL_SECONDARY) {
      try {
        model = MODEL_SECONDARY;
        const result = await runAnswerModel(env, model, prompt, mode);
        answer = finalizeAnswerText(extractText(result), citations);
      } catch (fallbackError) {
        return generationFailed(fallbackError, citations, mode);
      }
    } else {
      return generationFailed(error, citations, mode);
    }
  }

  const suggestions = await generateSmartSuggestions(env, {
    question,
    mode,
    citations,
    answer,
    history,
    previousSuggestions
  });

  const payload = {
    answer: answer || "I could not generate a stable answer from the retrieved corpus excerpts.",
    citations,
    corpus: responseCorpus(),
    mode,
    model,
    suggestions,
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

async function generateSmartSuggestions(env, { question, mode, citations, answer, history, previousSuggestions }) {
  const fallback = suggestionsFor(question, mode, citations, answer, history, previousSuggestions);
  if (!answer || !env.AI || typeof env.AI.run !== "function") return fallback;

  const prompt = buildSuggestionPrompt({
    question,
    mode,
    citations,
    answer,
    history,
    previousSuggestions,
    fallback
  });

  try {
    const result = await env.AI.run(MODEL_SECONDARY, {
      messages: prompt,
      temperature: 0.18,
      max_tokens: 420
    });
    const parsed = parseSuggestionResult(extractText(result), mode);
    const generated = chooseSuggestions(parsed, mode, question, history, previousSuggestions, { includeGeneral: false });
    const supplemented = chooseSuggestions(
      generated.concat(answerAwareSuggestionFallback(question, mode, citations, answer)),
      mode,
      question,
      history,
      previousSuggestions,
      { includeGeneral: false }
    );
    return supplemented.length === 3 ? supplemented : fallback;
  } catch {
    return fallback;
  }
}

function buildSuggestionPrompt({ question, mode, citations, answer, history, previousSuggestions, fallback }) {
  const sourceMap = citations
    .slice(0, 8)
    .map((citation) => `[${citation.id}] ${citation.title}; ${citation.code}; ${citation.kind}; ${citation.locator}; ${citation.url}`)
    .join("\n");
  const prior = previousSuggestions.length
    ? previousSuggestions.slice(-8).map((item) => `- ${suggestionText(item)}`).join("\n")
    : "None.";
  const fallbackExamples = fallback.map((item) => `- ${item.label}: ${item.question}`).join("\n");

  return [
    {
      role: "system",
      content: [
        "You generate follow-up chips for the CRI Research Assistant.",
        "The chips must be genuinely responsive to the last answer, not generic navigation.",
        "Generate exactly three follow-ups that a serious reader would naturally ask next after the answer.",
        "Each follow-up must point into one of these functions: clarify a boundary, locate a proof or definition, test a dependency, compare two named claims, request the citation target, or ask the next step in the argument.",
        "Do not repeat the user's question or previous chips.",
        "Do not mention internal notes, LLMS Site Summary, llms.txt, or unavailable source labels.",
        "Use only these modes: discuss, locate, cite.",
        "Return only JSON: an array of exactly three objects with keys label, question, mode, kind.",
        "Labels must be short, two to five words. Questions must be concrete and answer-aware."
      ].join(" ")
    },
    {
      role: "user",
      content: [
        `Mode: ${mode}`,
        `Recent conversation:\n${formatConversation(history)}`,
        `User question: ${question}`,
        `Assistant answer:\n${stripCitationLabels(answer).slice(0, 1800)}`,
        `Public source map:\n${sourceMap}`,
        `Previous chips to avoid:\n${prior}`,
        `Fallback examples for style only, not to copy:\n${fallbackExamples}`
      ].join("\n\n")
    }
  ];
}

function parseSuggestionResult(value, fallbackMode) {
  const jsonText = extractJsonArray(value);
  if (!jsonText) return [];
  try {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeSuggestion(item, fallbackMode))
      .filter((item) => item.question && item.label)
      .map((item) => ({
        ...item,
        mode: ["discuss", "locate", "cite"].includes(item.mode) ? item.mode : fallbackMode,
        label: clampSuggestionLabel(item.label),
        question: clampSuggestionQuestion(item.question)
      }))
      .filter((item) => item.question && item.label && !genericSuggestion(item.question));
  } catch {
    return [];
  }
}

function extractJsonArray(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("[")) {
    const end = text.lastIndexOf("]");
    return end >= 0 ? text.slice(0, end + 1) : "";
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return extractJsonArray(fenced[1]);
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  return start >= 0 && end > start ? text.slice(start, end + 1) : "";
}

function clampSuggestionLabel(value) {
  const text = normalizeQuestion(value).replace(/[?.!:;]+$/g, "");
  return text.split(/\s+/).slice(0, 5).join(" ").slice(0, 64);
}

function clampSuggestionQuestion(value) {
  const text = normalizeQuestion(value)
    .replace(/\[[SI]\d+\]/g, "")
    .replace(/\b(?:LLMS Site Summary|llms\.txt)\b/gi, "")
    .replace(/\bClosureResearchInitiative\.org\b/gi, "CRI")
    .replace(/\bClosureresearchinitiative\.org\b/gi, "CRI")
    .replace(/\bClosureresearchinitiative\.org websites?\b/gi, "current work pages")
    .replace(/\bClosure Research Initiative websites?\b/gi, "current work pages")
    .replace(/\bCRI websites?\b/gi, "current work pages");
  if (/release-control rule/i.test(text) && /\bwebsites?\b/i.test(text)) {
    return "Does the release-control rule apply to manuscripts, source bundles, and work pages?";
  }
  if (/release-control rule/i.test(text) && /\bpublications?\b/i.test(text)) {
    return "Does the release-control rule apply to all current CRI publications?";
  }
  return text
    .replace(/\bon other websites?\b/gi, "in the public record")
    .replace(/\bwebsites?\b/gi, "public records")
    .slice(0, 180);
}

function genericSuggestion(value) {
  const key = suggestionKey(value).replace(/\s+/g, "");
  return [
    "whatshouldireadnext",
    "whereisthisproved",
    "whatistheshortestdependencychain",
    "whatsourceisciteforthis",
    "explaintheanswer",
    "tellmemore",
    "showmoreresults"
  ].some((generic) => key === generic || key.includes(generic));
}

function answerAwareSuggestionFallback(question, mode, citations, answer = "") {
  const topic = suggestionTopic(question, answer);
  const topSource = citations[0];
  const sourceTitle = topSource ? shortSourceTitle(topSource.title) : "the strongest source";
  const text = `${question} ${answer}`.toLowerCase();
  const candidates = [];

  if (/boundary|weaker|missing|not support|not contain enough|does not/.test(text)) {
    candidates.push(
      sg(`What is the supported boundary of ${topic}?`, "discuss", "Boundary"),
      sg(`Which stronger claim about ${topic} is not supported here?`, "discuss", "Limit")
    );
  }
  if (/hypoth|condition|conditional|requires|under/.test(text)) {
    candidates.push(
      sg(`Which hypotheses control ${topic}?`, "discuss", "Hypotheses"),
      sg(`Where are the hypotheses for ${topic} stated?`, "locate", "Locate")
    );
  }
  if (/doi|version|archive|citation|bibtex|release-control/.test(text)) {
    candidates.push(
      sg(`Which current citation record controls ${topic}?`, "cite", "Citation"),
      sg(`How do archive rows change ${topic}?`, "discuss", "Archive"),
      sg(`Where is the version rule for ${topic} stated?`, "locate", "Locate")
    );
  }
  if (/proof|theorem|definition|lemma|corollary|stated/.test(text)) {
    candidates.push(
      sg(`Where is ${topic} stated most directly?`, "locate", "Locate"),
      sg(`What is the next proof dependency for ${topic}?`, "discuss", "Dependency")
    );
  }

  candidates.push(
    sg(`What exactly follows from ${topic}?`, "discuss", "Consequence"),
    sg(`Where does ${sourceTitle} support this answer?`, "locate", "Source"),
    sg(`Which citation should be used for ${topic}?`, "cite", "Cite")
  );

  return candidates;
}

function suggestionTopic(question, answer = "") {
  const combined = `${question} ${answer}`.toLowerCase();
  const pairs = [
    [/release-control|release control|version rule|current public version/, "the release-control rule"],
    [/archive doi|archive dois|archived doi|archived version/, "archive DOI handling"],
    [/rectangular completeness/, "rectangular completeness"],
    [/second-jet|second jet|faithful realization|faithfulness/, "second-jet faithfulness"],
    [/condition \(?t\)?|torsion/, "condition (T)"],
    [/axiom \(?d\)?|detectability/, "axiom (D)"],
    [/\bs3\b|s\^3|spherical geometry|three-sphere/, "the S3 conclusion"],
    [/charge|denominator-3|millicharged/, "the charge-sector prediction"],
    [/quotient semantics|subsystem attribution/, "quotient semantics"],
    [/transport obstruction|holonomy|route invariant/, "transport obstruction"],
    [/boundary datum|boundary data/, "boundary data"],
    [/conditional theorem|conditional status/, "conditional theorem status"]
  ];
  const found = pairs.find(([pattern]) => pattern.test(combined));
  if (found) return found[1];
  const terms = queryTerms(`${question} ${answer}`).slice(0, 3);
  return terms.length ? terms.join(" ") : "this claim";
}

function shortSourceTitle(value) {
  return normalizeQuestion(value)
    .replace(/\s+[-—]\s+Closure Research Initiative$/i, "")
    .replace(/^Closed Systems from Comparison Completeness$/i, "CSM")
    .replace(/^Corrections and Version Record$/i, "Corrections")
    .split(/\s+/)
    .slice(0, 7)
    .join(" ");
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

function normalizeSuggestions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => suggestionText(item).slice(0, 180))
    .filter(Boolean)
    .slice(0, 6);
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
  const assistantContext = contextDependentQuestion(question)
    ? history
        .filter((turn) => turn.role === "assistant")
        .slice(-1)
        .map((turn) => stripCitationLabels(turn.content).slice(0, MAX_CONTEXTUAL_ASSISTANT_CHARS))
        .join(" ")
    : "";
  return `${question} ${recentUserContext} ${assistantContext}`.trim();
}

function contextDependentQuestion(question) {
  const text = String(question || "").toLowerCase();
  const terms = tokenize(text).filter((term) => !STOPWORDS.has(term));
  return terms.length <= 4 || /\b(this|that|it|these|those|above|previous|claim|result|proof|source|citation|hypothesis|condition|step|there|here)\b/.test(text);
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
  const sourceMap = citations
    .map((citation) => `[${citation.id}] ${citation.code}; ${citation.kind}; locator ${citation.locator}; ${citation.url}`)
    .join("\n");
  const orientationContext = hiddenContext.length
    ? hiddenContext
        .map((source) => `[${source.id}] ${source.title}\nInternal note: ${source.excerpt}`)
        .join("\n\n")
    : "No internal orientation excerpts retrieved.";
  const conversation = formatConversation(history);
  const modeInstruction = modeInstructions(mode);

  return [
    {
      role: "system",
      content: [
        "You are the CRI Research Assistant, a source-bound conversational guide for closureresearchinitiative.org.",
        "You may speak directly to the reader in a calm, clear, technically serious voice.",
        "Treat the current question as part of a conversation. Resolve words such as this, that, it, the claim, the result, or the proof from the recent conversation when possible.",
        "Use the conversation history only to understand follow-up references and the user's intent; use the retrieved excerpts as the sole authority for factual claims.",
        "Answer only from the supplied excerpts. Do not use outside knowledge or unstated assumptions.",
        "Cite substantive claims with public bracketed source labels such as [S1] or [S2]. Use only labels present in the public source map.",
        "Internal orientation excerpts are labeled [I1], [I2], and so on. Use them only to understand the site structure or choose public sources.",
        "Never cite, quote, recommend, or mention internal orientation labels, LLMS Site Summary, or llms.txt in the final answer.",
        "If the excerpts support a weaker claim than the question asks for, state the weaker supported claim and name the missing support.",
        "If the excerpts do not support the answer, say that the retrieved corpus excerpts do not contain enough support.",
        "Do not invent theorem numbers, page numbers, URLs, paper titles, claims, or citations.",
        "Prefer useful synthesis over a string of excerpts, but keep every synthesis traceable to the source labels.",
        "Do not sound promotional or defensive. Do not oversell the program. State logical status, scope, and boundaries exactly.",
        "Use concise Markdown when it improves readability: short paragraphs, bullets for dependencies, and bold labels sparingly.",
        "Write in two layers. First give a conversational main answer in two to four short sentences, normally 70 to 120 words total, using at most one citation label unless the citation is essential.",
        "The main answer should read like an expert explaining the point to a serious reader, not like an abstract, bibliography note, or search-result summary.",
        "Put most citation labels and formal source comparisons in the Detailed support section rather than the visible main answer.",
        "Then, only when useful, add a separate section beginning exactly 'Detailed support:' for source-heavy breakdowns, proof dependencies, boundary notes, and reading routes.",
        "In the Detailed support section, use concise bullets with labels such as Support, Boundary, Dependencies, Where to read, or Citation note.",
        "Do not write source-dump sentences like 'Support for this claim can be found in [S1], [S2], [S3]...' and do not list every retrieved source just because it is available.",
        "If the answer is conditional, put the boundary in the Detailed support section unless it is essential to the main answer.",
        modeInstruction
      ].join(" ")
    },
    {
      role: "user",
      content: [
        `Mode: ${mode}`,
        `Recent conversation:\n${conversation}`,
        `Current question: ${question}`,
        `Public source map, the only citation labels allowed:\n${sourceMap}`,
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
      "Start with a line beginning 'Best place to read:' followed by the single strongest public source label.",
      "Then list the most relevant source labels with one-sentence reasons.",
      "If a follow-up asks where this is proved or defined, identify the source and locator supplied in the source map.",
      "Do not over-explain the theory unless needed to distinguish locations."
    ].join(" ");
  }
  if (mode === "cite") {
    return [
      "For cite mode, prioritize canonical citation details, DOI or URL evidence, and which work should be cited for which claim.",
      "Start with a line beginning 'Use:' when a citation target is supported.",
      "If the retrieved excerpts do not include a full citation field, say so instead of filling it in from memory.",
      "Distinguish the canonical current-version citation from archived or superseded versions when the excerpts expose that distinction."
    ].join(" ");
  }
  return [
    "For discuss mode, answer as a patient technical interlocutor rather than a search-result snippet.",
    "Begin with the direct answer, then give the proof/status/dependency structure only as far as the retrieved excerpts support it.",
    "When the question asks whether something is assumed, derived, theorem-level, conditional, or open, state the logical status explicitly.",
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

function finalizeAnswerText(value, citations = []) {
  const cleaned = cleanAnswerText(value, citations);
  if (!cleaned) return "";
  if (!citations.length || /\[S\d+\]/.test(cleaned)) return cleaned;
  const trail = citations
    .slice(0, 3)
    .map((citation) => `[${citation.id}] ${citation.title}`)
    .join("; ");
  return `${cleaned}\n\nDetailed support:\n- Support: closest retrieved public sources are ${trail}.`;
}

function cleanAnswerText(value, citations = []) {
  const validPublicLabels = new Set(citations.map((citation) => citation.id));
  const text = String(value || "").trim();
  const cleaned = text
    .replace(/\s*\[I\d+\]/g, "")
    .replace(/\[S\d+\]/g, (label) => (validPublicLabels.has(label.slice(1, -1)) ? label : ""))
    .replace(/\baccording to (?:the )?(?:LLMS Site Summary|llms\.txt),?\s*/gi, "")
    .replace(/\b(?:LLMS Site Summary|llms\.txt)\b/gi, "");
  return cleaned
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripCitationLabels(value) {
  return String(value || "")
    .replace(/\[[SI]\d+\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatConversation(history = []) {
  if (!history.length) return "No prior turns in this session.";
  return history
    .map((turn) => {
      const role = turn.role === "assistant" ? "Assistant" : "User";
      return `${role}: ${stripCitationLabels(turn.content).slice(0, 700)}`;
    })
    .join("\n");
}

function noCitationAnswer(question, history = []) {
  const terms = queryTerms(searchText(question, history)).slice(0, 6);
  const termHint = terms.length ? ` Useful search terms from the question are: ${terms.join(", ")}.` : "";
  return `I do not find enough public-facing corpus material to cite for that question. Try naming the paper, theorem topic, definition label, or exact phrase used on the site.${termHint}`;
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

function suggestionsFor(question, mode, citations, answer = "", history = [], previousSuggestions = []) {
  const text = `${question} ${answer}`.toLowerCase();
  if (mode === "cite") {
    return chooseSuggestions([
      sg("Which work should I cite for the main theorem?", "cite", "Citation"),
      sg("Give me the BibTeX for the current version.", "cite", "BibTeX"),
      sg("Which claims have DOI records now?", "cite", "DOI"),
      sg("Which version should be cited for this answer?", "cite", "Version"),
      sg("Show the citation boundary for this claim.", "cite", "Boundary"),
      sg("What source supports the narrower claim?", "cite", "Evidence"),
      sg("Explain the cited result in context.", "discuss", "Explain"),
      sg("Locate the proof behind this citation.", "locate", "Locate")
    ], mode, question, history, previousSuggestions);
  }
  if (mode === "locate") {
    return chooseSuggestions([
      sg("Summarize the result at the strongest location.", "discuss", "Explain"),
      sg("What depends on this result?", "discuss", "Dependencies"),
      sg("Which paper should I open first?", "locate", "Locate"),
      sg("Which definition should I read before this?", "locate", "Definition"),
      sg("Where is the proof step immediately after this?", "locate", "Proof"),
      sg("Show the nearest related theorem.", "locate", "Theorem"),
      sg("Which source should I cite for this location?", "cite", "Cite")
    ], mode, question, history, previousSuggestions);
  }
  const candidates = [];
  if (/not enough|not contain enough|missing support|weaker claim|not support/.test(text)) {
    candidates.push(
      sg("Which source comes closest to answering this?", "locate", "Locate"),
      sg("What exact term should I search for?", "locate", "Search"),
      sg("What is known from the retrieved sources?", "discuss", "Known"),
      sg("What claim would be safe to state from these sources?", "discuss", "Boundary"),
      sg("Which missing premise would need a citation?", "cite", "Missing"),
      sg("Where should I look next in the corpus?", "locate", "Next")
    );
  }
  if (/conditional|hypotheses|requires|assuming|under the stated/.test(text)) {
    candidates.push(
      sg("List the hypotheses needed for this claim.", "discuss", "Status"),
      sg("Which parts are proved and which are conditional?", "discuss", "Status"),
      sg("Where does this condition enter the proof?", "locate", "Locate"),
      sg("Which hypothesis is doing the most work?", "discuss", "Stress"),
      sg("What changes if that hypothesis is removed?", "discuss", "Stress"),
      sg("Where is each hypothesis discharged?", "locate", "Discharge"),
      sg("What is the strongest unconditional statement here?", "discuss", "Boundary"),
      sg("Which source should I cite for these hypotheses?", "cite", "Cite")
    );
  }
  if (/\bs3\b|s\^3|sphere|spherical|geometry/.test(text)) {
    candidates.push(
      sg("Is S3 assumed or derived?", "discuss", "Status"),
      sg("What hypotheses are needed for the S3 conclusion?", "discuss", "Hypotheses"),
      sg("Where is frame completeness used?", "locate", "Locate"),
      sg("Trace the route from frame completeness to constant curvature.", "discuss", "Chain"),
      sg("Where does simple connectivity enter?", "locate", "Locate"),
      sg("What non-S3 alternatives are ruled out?", "discuss", "Alternatives"),
      sg("Which source should I cite for the S3 conclusion?", "cite", "Cite")
    );
  }
  if (/rectangular|completeness|product/.test(text)) {
    candidates.push(
      sg("What does rectangular completeness rule out?", "discuss", "Meaning"),
      sg("Where is this proved in the monograph?", "locate", "Locate"),
      sg("How does this relate to standard physical closure?", "discuss", "Compare"),
      sg("Which definition of comparison world is being used?", "locate", "Definition"),
      sg("What would fail without rectangular completeness?", "discuss", "Stress"),
      sg("How does the RC paper sharpen this point?", "locate", "Paper"),
      sg("Which source should I cite for rectangular completeness?", "cite", "Cite")
    );
  }
  if (/second-jet|jet|faithfulness|torsion|detectability|\(t\)|\(d\)/.test(text)) {
    candidates.push(
      sg("Why is the second jet the needed level?", "discuss", "Explain"),
      sg("Where do condition (T) and axiom (D) enter?", "locate", "Locate"),
      sg("What would fail at first jet?", "discuss", "Stress"),
      sg("How is second-jet faithfulness discharged?", "locate", "Discharge"),
      sg("Which part is theorem and which part is a criterion?", "discuss", "Status"),
      sg("Where does this feed into curvature?", "locate", "Chain"),
      sg("Which source should I cite for second-jet faithfulness?", "cite", "Cite")
    );
  }
  if (/quotient|transport|obstruction|curvature|holonomy/.test(text)) {
    candidates.push(
      sg("Trace the dependency from quotient semantics to curvature.", "discuss", "Chain"),
      sg("Where is transport obstruction first defined?", "locate", "Locate"),
      sg("How does this connect to the S3 theorem?", "discuss", "Connect"),
      sg("Which quotient equality is being used here?", "locate", "Locate"),
      sg("What loop or route invariant controls this step?", "discuss", "Invariant"),
      sg("Where does obstruction become geometric?", "locate", "Locate"),
      sg("Which source should I cite for the obstruction step?", "cite", "Cite")
    );
  }
  if (/charge|millicharged|prediction|denominator/.test(text)) {
    candidates.push(
      sg("State the prediction as a falsifiable claim.", "discuss", "Prediction"),
      sg("Where is the denominator-3 lattice defined?", "locate", "Locate"),
      sg("Which source should be cited for this prediction?", "cite", "Cite"),
      sg("What would count as an experimental conflict?", "discuss", "Test"),
      sg("How does this differ from ordinary charge quantization?", "discuss", "Compare"),
      sg("Which assumptions does the prediction use?", "discuss", "Hypotheses")
    );
  }
  if (citations.some((citation) => citation.code === "csm")) {
    candidates.push(
      sg("What is the exact logical status of this claim?", "discuss", "Status"),
      sg("Where does the proof enter the monograph?", "locate", "Locate"),
      sg("What are the needed hypotheses?", "discuss", "Hypotheses"),
      sg("Which chapter should I read next?", "locate", "Next"),
      sg("What is the shortest dependency chain?", "discuss", "Chain"),
      sg("Which supporting paper gives the focused version?", "locate", "Paper"),
      sg("Which source should I cite for this claim?", "cite", "Cite")
    );
  }
  return chooseSuggestions(candidates.length ? candidates : defaultSuggestions(mode), mode, question, history, previousSuggestions);
}

function defaultSuggestions(mode, history = [], previousSuggestions = []) {
  if (mode === "locate") {
    return chooseSuggestions([
      sg("Open the best source.", "locate", "Locate"),
      sg("Explain this result.", "discuss", "Explain"),
      sg("Show related dependencies.", "discuss", "Dependencies"),
      sg("What proof step comes next?", "locate", "Proof"),
      sg("Which source is most central?", "cite", "Cite")
    ], mode, "", history, previousSuggestions);
  }
  if (mode === "cite") {
    return chooseSuggestions([
      sg("Give canonical citations.", "cite", "Citation"),
      sg("Show DOI records.", "cite", "DOI"),
      sg("Which version should be cited?", "cite", "Version"),
      sg("Which claim does this source support?", "discuss", "Boundary"),
      sg("Show BibTeX for the closest source.", "cite", "BibTeX")
    ], mode, "", history, previousSuggestions);
  }
  return chooseSuggestions([
    sg("What is the exact logical status?", "discuss", "Status"),
    sg("Where is this proved?", "locate", "Locate"),
    sg("How does this connect to the rest of the program?", "discuss", "Connect"),
    sg("Which definition controls this point?", "locate", "Definition"),
    sg("What should I read next?", "locate", "Next"),
    sg("What is the shortest dependency chain?", "discuss", "Chain"),
    sg("Which source should I cite for this?", "cite", "Cite")
  ], mode, "", history, previousSuggestions);
}

function chooseSuggestions(candidates, mode, question, history = [], previousSuggestions = [], options = {}) {
  const recentQuestions = history
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.content)
    .concat(question);
  const asked = new Set(recentQuestions.map(suggestionKey));
  const previous = new Set(previousSuggestions.map(suggestionKey));
  const sourceCandidates = options.includeGeneral === false ? candidates : [...candidates, ...generalFollowups(mode)];
  const unique = [];
  const seen = new Set();

  for (const candidate of sourceCandidates) {
    const item = normalizeSuggestion(candidate, mode);
    const clean = item.question;
    const key = suggestionKey(clean);
    if (!clean || seen.has(key) || asked.has(key)) continue;
    seen.add(key);
    unique.push({ ...item, key });
  }

  let pool = unique.filter((item) => !previous.has(item.key));
  if (pool.length < 3) {
    pool = pool.concat(unique.filter((item) => previous.has(item.key)));
  }

  const selected = [];
  for (const desiredMode of suggestionModeOrder(mode)) {
    const pick = pool.find((item) => item.mode === desiredMode && !selected.some((chosen) => chosen.key === item.key));
    if (pick) selected.push(pick);
    if (selected.length === 3) break;
  }
  for (const item of pool) {
    if (selected.length === 3) break;
    if (!selected.some((chosen) => chosen.key === item.key)) selected.push(item);
  }

  return selected.slice(0, 3).map(({ key, ...item }) => item);
}

function generalFollowups(mode) {
  if (mode === "cite") {
    return [
      sg("Which citation should not be used for this claim?", "cite", "Boundary"),
      sg("What is the narrowest citable statement?", "discuss", "Boundary"),
      sg("Where is the public source record?", "locate", "Locate")
    ];
  }
  if (mode === "locate") {
    return [
      sg("Which section should I read before this?", "locate", "Before"),
      sg("Which section should I read after this?", "locate", "After"),
      sg("Show the closest supporting paper.", "locate", "Paper"),
      sg("Which source should I cite here?", "cite", "Cite")
    ];
  }
  return [
    sg("Give the shortest version of the argument.", "discuss", "Short"),
    sg("Trace the dependency chain one step deeper.", "discuss", "Chain"),
    sg("What is the next natural objection to check?", "discuss", "Test"),
    sg("Where does this appear outside the monograph?", "locate", "Locate"),
    sg("Which statement is safest to quote?", "cite", "Cite")
  ];
}

function suggestionModeOrder(mode) {
  if (mode === "cite") return ["cite", "discuss", "locate"];
  if (mode === "locate") return ["locate", "discuss", "cite"];
  return ["discuss", "locate", "cite"];
}

function sg(question, mode = "discuss", kind = "") {
  return { label: question, question, mode, kind };
}

function normalizeSuggestion(item, fallbackMode = "discuss") {
  if (typeof item === "string") {
    const question = normalizeQuestion(item);
    return { label: question, question, mode: fallbackMode, kind: fallbackMode };
  }
  const question = normalizeQuestion(item?.question || item?.label || "");
  const suggestionMode = VALID_MODES.has(item?.mode) ? item.mode : fallbackMode;
  return {
    label: normalizeQuestion(item?.label || question),
    question,
    mode: suggestionMode,
    kind: normalizeQuestion(item?.kind || suggestionMode).slice(0, 40)
  };
}

function suggestionText(item) {
  if (typeof item === "string") return normalizeQuestion(item);
  return normalizeQuestion(item?.question || item?.label || "");
}

function suggestionKey(value) {
  return suggestionText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cacheKeyFor(question, mode, history, previousSuggestions = []) {
  const historyText = history.map((turn) => `${turn.role}:${turn.content}`).join("|");
  const suggestionText = previousSuggestions.map(suggestionKey).join("|");
  return `${mode}|${question.toLowerCase()}|${historyText}|${suggestionText}`.slice(0, 2800);
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
