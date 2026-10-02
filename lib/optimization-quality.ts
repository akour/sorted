import { validateGooglePlayListingText } from "./google-play-localizations";

export type OptimizationDraftQualityInput = {
  storeTitle?: string | null;
  storeSubtitle?: string | null;
  storeShortDescription?: string | null;
  storeLongDescription?: string | null;
  answerSummary?: string | null;
  currentListing?: unknown;
};

export type OptimizationDraftIssue = {
  field: "title" | "shortDescription" | "fullDescription" | "answerSummary";
  message: string;
};

const MIN_FULL_DESCRIPTION_LENGTH = 160;

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function currentFullDescription(value: unknown): string {
  if (typeof value === "string") {
    try {
      return currentFullDescription(JSON.parse(value) as unknown);
    } catch {
      return "";
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const row = value as Record<string, unknown>;
  const description = typeof row.longDescription === "string" ? row.longDescription : row.fullDescription;
  return typeof description === "string" ? description : "";
}

function looksLikePlaceholder(value: string) {
  const text = normalized(value);
  return !text
    || /^(clarify the product promise|people evaluating this product|to be verified|todo|insert\b)/i.test(text)
    || /\bverify every (store )?claim\b/i.test(text);
}

export function getOptimizationDraftIssues(draft: OptimizationDraftQualityInput): OptimizationDraftIssue[] {
  const title = draft.storeTitle ?? "";
  const shortDescription = draft.storeShortDescription ?? "";
  const fullDescription = draft.storeLongDescription ?? "";
  const answerSummary = draft.answerSummary ?? "";
  const issues: OptimizationDraftIssue[] = [];

  for (const message of validateGooglePlayListingText({ title, shortDescription, fullDescription })) {
    const field = message.startsWith("App title") ? "title"
      : message.startsWith("Short description") ? "shortDescription"
        : "fullDescription";
    issues.push({ field, message });
  }

  if (title.trim() && looksLikePlaceholder(title)) {
    issues.push({ field: "title", message: "Replace placeholder wording with the product's real store title." });
  }

  if (fullDescription.trim() && fullDescription.trim().length < MIN_FULL_DESCRIPTION_LENGTH) {
    issues.push({ field: "fullDescription", message: "This is too short to be a full store description. Add the product details and supported benefits, not filler." });
  }

  if (fullDescription.trim() && normalized(fullDescription) === normalized(shortDescription)) {
    issues.push({ field: "fullDescription", message: "The full description is only the short description. Add a complete draft before handoff." });
  }

  const currentDescription = currentFullDescription(draft.currentListing);
  if (fullDescription.trim() && currentDescription.trim() && normalized(fullDescription) === normalized(currentDescription)) {
    issues.push({ field: "fullDescription", message: "The full description is unchanged from the current listing. Create a real revision before marking this optimization ready." });
  }

  if (!answerSummary.trim()) {
    issues.push({ field: "answerSummary", message: "An answer summary is required before handoff." });
  } else if (looksLikePlaceholder(answerSummary) || /\b(to be verified|verify every|verify no |confirm no )\b/i.test(answerSummary)) {
    issues.push({ field: "answerSummary", message: "This field must contain factual product copy, not a verification reminder or placeholder." });
  }

  return issues;
}
