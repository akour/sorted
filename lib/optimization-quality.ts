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

function normalized(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function looksLikePlaceholder(value: string) {
  const text = normalized(value);
  return !text
    || /^(clarify the product promise|people evaluating this product|to be verified|todo|insert\b)/i.test(text)
    || /\bverify every (store )?claim\b/i.test(text);
}

export function getOptimizationDraftIssues(draft: OptimizationDraftQualityInput, options: { requireAnswerSummary?: boolean } = {}): OptimizationDraftIssue[] {
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

  if (options.requireAnswerSummary && !answerSummary.trim()) {
    issues.push({ field: "answerSummary", message: "An answer summary is required before handoff." });
  } else if (options.requireAnswerSummary && (looksLikePlaceholder(answerSummary) || /\b(to be verified|verify every|verify no |confirm no )\b/i.test(answerSummary))) {
    issues.push({ field: "answerSummary", message: "This field must contain factual product copy, not a verification reminder or placeholder." });
  }

  return issues;
}
