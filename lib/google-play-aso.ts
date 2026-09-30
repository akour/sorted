export const GOOGLE_PLAY_LISTING_LIMITS = {
  title: 30,
  shortDescription: 80,
  fullDescription: 4_000,
} as const;

export type GooglePlayAuditListing = {
  title?: string;
  shortDescription?: string;
  longDescription?: string;
  fetchSource?: string;
};

export type GooglePlayAuditCheck = {
  id: string;
  label: string;
  status: "pass" | "attention" | "verify";
  detail: string;
};

function fieldCheck(id: string, label: string, value: string | undefined, limit: number): GooglePlayAuditCheck {
  const length = value?.length ?? 0;
  if (!value?.trim()) {
    return { id, label, status: "attention", detail: `Missing · Google Play allows up to ${limit.toLocaleString()} characters.` };
  }
  if (length > limit) {
    return { id, label, status: "attention", detail: `${length.toLocaleString()}/${limit.toLocaleString()} characters · over the limit.` };
  }
  return { id, label, status: "pass", detail: `${length.toLocaleString()}/${limit.toLocaleString()} characters.` };
}

/** Checks factual source provenance and official Play listing field limits only. */
export function analyzeGooglePlayListing(listing: GooglePlayAuditListing = {}): GooglePlayAuditCheck[] {
  return [
    {
      id: "source",
      label: "Listing source",
      status: listing.fetchSource === "google-play-api" ? "pass" : "verify",
      detail: listing.fetchSource === "google-play-api"
        ? "Fetched from the connected Google Play account."
        : "Public-page data is a preview; connect Google Play to verify the exact listing.",
    },
    fieldCheck("title", "App title", listing.title, GOOGLE_PLAY_LISTING_LIMITS.title),
    fieldCheck("short-description", "Short description", listing.shortDescription, GOOGLE_PLAY_LISTING_LIMITS.shortDescription),
    fieldCheck("full-description", "Full description", listing.longDescription, GOOGLE_PLAY_LISTING_LIMITS.fullDescription),
  ];
}
