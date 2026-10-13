import { productWorkspaceKind } from "./product-workspace";
export const ANSWER_STATUSES = ["draft", "ready", "published"] as const;
export type AnswerStatus = typeof ANSWER_STATUSES[number];

export type AnswerFact = {
  id: string;
  statement: string;
  sourceUrl: string;
};

export type AnswerCard = {
  id: string;
  question: string;
  answer: string;
  sourceUrl: string;
  status: AnswerStatus;
};

export type AnswerVisibilityProfile = {
  productId: number;
  primaryPageUrl: string;
  primaryClaim: string;
  facts: AnswerFact[];
  answers: AnswerCard[];
  updatedAt?: string;
};

export type AnswerVisibilityProduct = {
  name: string;
  type: string;
  url?: string;
  position?: string;
  audience?: string;
};

export type AnswerRecommendation = {
  id: string;
  priority: "Do now" | "Next" | "Then";
  title: string;
  detail: string;
  target: "source" | "facts" | "answers" | "package";
  complete: boolean;
};

const textLimit = 900;
const urlLimit = 500;

function isChoice<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

function cleanText(value: unknown, limit = textLimit) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

function cleanUrl(value: unknown) {
  const candidate = typeof value === "string" ? value.trim().slice(0, urlLimit) : "";
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function stableId(prefix: string, value: string, index: number) {
  const key = value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48);
  return `${prefix}-${key || index + 1}`;
}

export function emptyAnswerVisibility(productId: number): AnswerVisibilityProfile {
  return { productId, primaryPageUrl: "", primaryClaim: "", facts: [], answers: [] };
}

export function starterAnswerCards(product: AnswerVisibilityProduct): AnswerCard[] {
  return [
    `What is ${product.name}?`,
    `Who is ${product.name} for?`,
    `How does ${product.name} help?`,
  ].map((question, index) => ({ id: stableId("answer", question, index), question, answer: "", sourceUrl: "", status: "draft" as const }));
}

function parseFacts(value: unknown): AnswerFact[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const statement = cleanText(item.statement, 500);
    const key = statement.toLocaleLowerCase();
    if (!statement || seen.has(key)) return [];
    seen.add(key);
    return [{ id: typeof item.id === "string" && /^[a-z0-9-]{1,72}$/i.test(item.id) ? item.id : stableId("fact", statement, index), statement, sourceUrl: cleanUrl(item.sourceUrl) } satisfies AnswerFact];
  }).slice(0, 24);
}

function parseAnswers(value: unknown): AnswerCard[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const question = cleanText(item.question, 220);
    const key = question.toLocaleLowerCase();
    if (!question || seen.has(key)) return [];
    seen.add(key);
    return [{
      id: typeof item.id === "string" && /^[a-z0-9-]{1,72}$/i.test(item.id) ? item.id : stableId("answer", question, index),
      question,
      answer: cleanText(item.answer, textLimit),
      sourceUrl: cleanUrl(item.sourceUrl),
      status: isChoice(item.status, ANSWER_STATUSES) ? item.status : "draft",
    } satisfies AnswerCard];
  }).slice(0, 20);
}

export function parseAnswerVisibility(value: { productId: number; primaryPageUrl?: string | null; primaryClaim?: string | null; facts?: string | null; answers?: string | null; updatedAt?: string | null } | undefined, productId: number): AnswerVisibilityProfile {
  if (!value) return emptyAnswerVisibility(productId);
  let facts: unknown = [];
  let answers: unknown = [];
  try { facts = JSON.parse(value.facts ?? "[]"); } catch { /* retain empty data */ }
  try { answers = JSON.parse(value.answers ?? "[]"); } catch { /* retain empty data */ }
  return {
    productId,
    primaryPageUrl: cleanUrl(value.primaryPageUrl),
    primaryClaim: cleanText(value.primaryClaim, 420),
    facts: parseFacts(facts),
    answers: parseAnswers(answers),
    updatedAt: value.updatedAt ?? undefined,
  };
}

export function answerVisibilityStorage(profile: AnswerVisibilityProfile) {
  return {
    primaryPageUrl: cleanUrl(profile.primaryPageUrl),
    primaryClaim: cleanText(profile.primaryClaim, 420),
    facts: JSON.stringify(parseFacts(profile.facts)),
    answers: JSON.stringify(parseAnswers(profile.answers)),
  };
}

export function isPublicWebPage(url: string) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) && !/(^|\.)play\.google\.com$/i.test(parsed.hostname) && !/(^|\.)apps\.apple\.com$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

export function answerRecommendations(product: AnswerVisibilityProduct, profile: AnswerVisibilityProfile): AnswerRecommendation[] {
  const directAnswers = profile.answers.filter((item) => item.answer.trim());
  const evidenceBackedAnswers = directAnswers.filter((item) => item.sourceUrl || profile.facts.length > 0);
  const hasPublishedAnswer = directAnswers.some((item) => item.status === "published");
  const schemaReady = Boolean(isPublicWebPage(profile.primaryPageUrl) && profile.primaryClaim);
  const recommendations: AnswerRecommendation[] = [
    {
      id: "source-page",
      priority: "Do now",
      title: "Name one public source page",
      detail: "Give answer engines a canonical page where this product is explained in full. Store pages alone are not a substitute for an owned, indexable source.",
      target: "source",
      complete: isPublicWebPage(profile.primaryPageUrl),
    },
    {
      id: "primary-claim",
      priority: "Do now",
      title: "State the product’s clearest answer",
      detail: "Write one accurate sentence that says what it is and why someone would use it. It must be visible on the public page, not only in markup.",
      target: "source",
      complete: Boolean(profile.primaryClaim),
    },
    {
      id: "evidence",
      priority: "Next",
      title: "Ground claims in source material",
      detail: "Capture the facts, documentation, or public pages that support your important claims. Do not add metrics, awards, or capabilities you cannot show.",
      target: "facts",
      complete: profile.facts.length >= 2,
    },
    {
      id: "answers",
      priority: "Next",
      title: "Answer the questions people actually ask",
      detail: `Publish clear answers to what ${product.name} is, who it is for, and how it helps. Lead with the answer, then add useful detail.`,
      target: "answers",
      complete: directAnswers.length >= 3 && evidenceBackedAnswers.length >= 3,
    },
    {
      id: "schema",
      priority: "Then",
      title: "Add matching application markup",
      detail: "Copy the schema scaffold only after the same name, description, and page URL are visible to users. Validate it after publishing; markup helps machines understand a page but does not guarantee a feature or citation.",
      target: "package",
      complete: schemaReady,
    },
    {
      id: "publish",
      priority: "Then",
      title: "Publish and keep one source current",
      detail: "Mark an answer published only once it is available on the source page. Revisit facts whenever the product, claims, or availability changes.",
      target: "answers",
      complete: hasPublishedAnswer,
    },
  ];
  return recommendations;
}

export function answerVisibilityScore(product: AnswerVisibilityProduct, profile: AnswerVisibilityProfile) {
  const recommendations = answerRecommendations(product, profile);
  return { complete: recommendations.filter((item) => item.complete).length, total: recommendations.length, recommendations };
}

export function buildApplicationSchema(product: AnswerVisibilityProduct, profile: AnswerVisibilityProfile) {
  const isGame = /game/i.test(product.type);
  const kind = productWorkspaceKind(product);
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": kind === "website" ? "WebSite" : isGame ? ["VideoGame", "MobileApplication"] : "MobileApplication",
    name: product.name,
    description: profile.primaryClaim || product.position || "Add a factual product description before publishing this markup.",
    ...(kind === "google-play" ? { operatingSystem: "Android" } : {}),
  };
  if (profile.primaryPageUrl) schema.url = profile.primaryPageUrl;
  if (product.url && /^https?:/i.test(product.url)) schema.sameAs = product.url;
  return `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
}

export function buildAnswerPageBrief(product: AnswerVisibilityProduct, profile: AnswerVisibilityProfile) {
  const answers = profile.answers.filter((item) => item.answer.trim());
  const facts = profile.facts.filter((item) => item.statement.trim());
  return [
    `# ${product.name}`,
    "",
    `Canonical page: ${profile.primaryPageUrl || "Add the public product page URL before publishing."}`,
    "",
    "## Direct answer",
    profile.primaryClaim || product.position || "Write one factual sentence explaining what this product is and why someone would use it.",
    "",
    "## Questions and answers",
    ...(answers.length ? answers.flatMap((item) => [`### ${item.question}`, item.answer, item.sourceUrl ? `Source: ${item.sourceUrl}` : "", ""]) : ["Add three evidence-backed answer cards in Sorted before exporting this section.", ""]),
    "## Facts to keep consistent",
    ...(facts.length ? facts.flatMap((item) => [`- ${item.statement}${item.sourceUrl ? ` — ${item.sourceUrl}` : ""}`]) : ["- Add public facts or documentation links before publishing." ]),
    "",
    "## Implementation checks",
    "- Keep the same claims visible in the page copy and its structured data.",
    "- Ensure the page is publicly crawlable and not blocked from indexing.",
    "- Validate markup after publishing; it supports understanding but does not guarantee an answer-engine citation.",
  ].join("\n");
}
