export const GOOGLE_PLAY_EXPERIMENT_FIELDS = {
  shortDescription: {
    label: "Short description",
    listingKey: "shortDescription",
    maxLength: 80,
  },
  fullDescription: {
    label: "Full description",
    listingKey: "longDescription",
    maxLength: 4_000,
  },
} as const;

export type GooglePlayExperimentField = keyof typeof GOOGLE_PLAY_EXPERIMENT_FIELDS;

export const GOOGLE_PLAY_EXPERIMENT_OUTCOMES = [
  "variant_better",
  "current_better",
  "draw",
  "more_data_needed",
] as const;

export type GooglePlayExperimentOutcome = typeof GOOGLE_PLAY_EXPERIMENT_OUTCOMES[number];

export const GOOGLE_PLAY_EXPERIMENT_OUTCOME_LABELS: Record<GooglePlayExperimentOutcome, string> = {
  variant_better: "Variant performed better",
  current_better: "Current listing performed better",
  draw: "Draw / no clear winner",
  more_data_needed: "Play Console says more data is needed",
};

export function isGooglePlayExperimentField(value: unknown): value is GooglePlayExperimentField {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(GOOGLE_PLAY_EXPERIMENT_FIELDS, value);
}

export function isGooglePlayExperimentOutcome(value: unknown): value is GooglePlayExperimentOutcome {
  return typeof value === "string" && GOOGLE_PLAY_EXPERIMENT_OUTCOMES.includes(value as GooglePlayExperimentOutcome);
}

export function validateGooglePlayExperimentDraft(input: {
  field: unknown;
  hypothesis: unknown;
  baseline: unknown;
  variant: unknown;
  fetchSource: unknown;
}): string | null {
  if (input.fetchSource !== "google-play-api") {
    return "Sync the listing from the connected Google Play account before planning an experiment.";
  }
  if (!isGooglePlayExperimentField(input.field)) return "Choose a supported Google Play description field.";
  if (typeof input.hypothesis !== "string" || input.hypothesis.trim().length < 8 || input.hypothesis.length > 500) {
    return "Add a clear experiment hypothesis between 8 and 500 characters.";
  }
  if (typeof input.baseline !== "string" || !input.baseline.trim()) {
    return "The authenticated listing does not contain this description yet.";
  }
  if (typeof input.variant !== "string" || !input.variant.trim()) {
    return "Add a test variant before saving the plan.";
  }
  const limit = GOOGLE_PLAY_EXPERIMENT_FIELDS[input.field].maxLength;
  if ([...input.variant].length > limit) {
    return `${GOOGLE_PLAY_EXPERIMENT_FIELDS[input.field].label} must be ${limit.toLocaleString()} characters or fewer.`;
  }
  if (input.variant.trim() === input.baseline.trim()) {
    return "The test variant must differ from the current listing.";
  }
  return null;
}
