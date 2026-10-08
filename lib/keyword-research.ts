export const KEYWORD_INTENTS = ["core", "feature", "problem", "audience"] as const;
export const KEYWORD_STATUSES = ["shortlist", "tracking", "used", "avoid"] as const;
export const KEYWORD_PLACEMENTS = ["not-planned", "title", "short-description", "long-description"] as const;
export const KEYWORD_SOURCES = ["AI suggestion", "Play Console", "Manual"] as const;

export type KeywordIntent = typeof KEYWORD_INTENTS[number];
export type KeywordStatus = typeof KEYWORD_STATUSES[number];
export type KeywordPlacement = typeof KEYWORD_PLACEMENTS[number];
export type KeywordSource = typeof KEYWORD_SOURCES[number];

export type KeywordCandidate = {
  id: string;
  phrase: string;
  intent: KeywordIntent;
  status: KeywordStatus;
  placement: KeywordPlacement;
  source: KeywordSource;
  rationale: string;
};

export type KeywordResearch = {
  productId: number;
  market: string;
  seedTerms: string[];
  keywords: KeywordCandidate[];
  notes: string;
  generatedAt?: string | null;
  updatedAt?: string;
};

const phraseLimit = 80;
const noteLimit = 240;

function isOneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

function phraseKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function keywordId(phrase: string) {
  return phraseKey(phrase).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 56) || `keyword-${Math.random().toString(36).slice(2, 9)}`;
}

export function parseStringList(value: unknown, limit = 24) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,;]+/) : [];
  const seen = new Set<string>();
  return source
    .map((item) => typeof item === "string" ? item.replace(/\s+/g, " ").trim() : "")
    .filter((item) => item.length > 1 && item.length <= phraseLimit)
    .filter((item) => {
      const key = phraseKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function normalizeKeywords(value: unknown, limit = 40): KeywordCandidate[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const candidate = entry as Record<string, unknown>;
    const phrase = typeof candidate.phrase === "string" ? candidate.phrase.replace(/\s+/g, " ").trim() : "";
    const key = phraseKey(phrase);
    if (!phrase || phrase.length > phraseLimit || seen.has(key)) return [];
    seen.add(key);
    return [{
      id: typeof candidate.id === "string" && /^[a-z0-9-]{1,72}$/i.test(candidate.id) ? candidate.id : keywordId(phrase),
      phrase,
      intent: isOneOf(candidate.intent, KEYWORD_INTENTS) ? candidate.intent : "core",
      status: isOneOf(candidate.status, KEYWORD_STATUSES) ? candidate.status : "shortlist",
      placement: isOneOf(candidate.placement, KEYWORD_PLACEMENTS) ? candidate.placement : "not-planned",
      source: isOneOf(candidate.source, KEYWORD_SOURCES) ? candidate.source : "Manual",
      rationale: typeof candidate.rationale === "string" ? candidate.rationale.trim().slice(0, noteLimit) : "",
    } satisfies KeywordCandidate];
  }).slice(0, limit);
}

export function parseKeywordResearch(value: { productId: number; market?: string | null; seedTerms?: string | null; keywords?: string | null; notes?: string | null; generatedAt?: string | null; updatedAt?: string | null } | undefined, productId: number): KeywordResearch {
  if (!value) return emptyKeywordResearch(productId);
  let seedTerms: unknown = [];
  let keywords: unknown = [];
  try { seedTerms = JSON.parse(value.seedTerms ?? "[]"); } catch { /* keep empty */ }
  try { keywords = JSON.parse(value.keywords ?? "[]"); } catch { /* keep empty */ }
  return {
    productId,
    market: typeof value.market === "string" && value.market.trim() ? value.market.trim().slice(0, 40) : "en-US",
    seedTerms: parseStringList(seedTerms),
    keywords: normalizeKeywords(keywords),
    notes: typeof value.notes === "string" ? value.notes.trim().slice(0, 2_000) : "",
    generatedAt: value.generatedAt ?? undefined,
    updatedAt: value.updatedAt ?? undefined,
  };
}

export function emptyKeywordResearch(productId: number): KeywordResearch {
  return { productId, market: "en-US", seedTerms: [], keywords: [], notes: "" };
}

export function keywordResearchStorage(research: KeywordResearch) {
  return {
    market: research.market.trim().slice(0, 40) || "en-US",
    seedTerms: JSON.stringify(parseStringList(research.seedTerms)),
    keywords: JSON.stringify(normalizeKeywords(research.keywords)),
    notes: research.notes.trim().slice(0, 2_000),
  };
}

export function observedKeywordCandidates(terms: string[], existing: KeywordCandidate[]) {
  const existingTerms = new Set(existing.map((item) => phraseKey(item.phrase)));
  return parseStringList(terms, 12).filter((term) => !existingTerms.has(phraseKey(term))).map((phrase) => ({
    id: keywordId(phrase), phrase, intent: "core" as const, status: "tracking" as const, placement: "not-planned" as const,
    source: "Play Console" as const, rationale: "Observed in an imported Play Console performance report. Confirm relevance before using it in metadata.",
  }));
}

export function starterKeywords(input: { seedTerms: string[]; semanticCore?: string; name: string; position?: string; audience?: string; existing?: KeywordCandidate[] }) {
  const supplied = parseStringList(input.seedTerms);
  const semantic = parseStringList(input.semanticCore ?? "");
  const productWords = parseStringList([input.position ?? "", input.audience ?? ""]);
  const raw = [...supplied, ...semantic, ...productWords].filter((value) => !value.includes(" ") || value.split(" ").length <= 7);
  const fallback = input.name.trim() ? [input.name.trim()] : [];
  const seen = new Set((input.existing ?? []).map((item) => phraseKey(item.phrase)));
  return parseStringList([...raw, ...fallback], 18).filter((phrase) => !seen.has(phraseKey(phrase))).map((phrase, index) => ({
    id: keywordId(phrase), phrase,
    intent: index === 0 ? "core" as const : "feature" as const,
    status: "shortlist" as const,
    placement: "not-planned" as const,
    source: "AI suggestion" as const,
    rationale: "Starter hypothesis based on your product brief or current store context. Validate it against the product and real search data.",
  }));
}

export function mergeKeywords(existing: KeywordCandidate[], additions: KeywordCandidate[]) {
  const next = [...existing];
  const known = new Set(existing.map((item) => phraseKey(item.phrase)));
  for (const item of additions) {
    if (!known.has(phraseKey(item.phrase))) {
      next.push(item);
      known.add(phraseKey(item.phrase));
    }
  }
  return normalizeKeywords(next);
}
