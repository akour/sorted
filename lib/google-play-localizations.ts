export const GOOGLE_PLAY_TARGET_LOCALES = [
  { locale: "es-419", label: "Spanish (Latin America)" },
  { locale: "pt-BR", label: "Portuguese (Brazil)" },
  { locale: "hi-IN", label: "Hindi (India)" },
  { locale: "id", label: "Indonesian" },
  { locale: "ja-JP", label: "Japanese" },
  { locale: "ko-KR", label: "Korean" },
  { locale: "de-DE", label: "German" },
  { locale: "fr-FR", label: "French (France)" },
  { locale: "ar", label: "Arabic" },
  { locale: "tr-TR", label: "Turkish" },
] as const;

export type GooglePlayTargetLocale = (typeof GOOGLE_PLAY_TARGET_LOCALES)[number]["locale"];
export type LocalizedStoreListing = {
  locale: GooglePlayTargetLocale;
  title: string;
  shortDescription: string;
  fullDescription: string;
  sourceHash: string;
  status: "needs-review" | "ready";
  updatedAt?: string;
};

export type GooglePlayListingText = {
  title: string;
  shortDescription: string;
  fullDescription: string;
};

export function isGooglePlayTargetLocale(value: unknown): value is GooglePlayTargetLocale {
  return typeof value === "string" && GOOGLE_PLAY_TARGET_LOCALES.some((item) => item.locale === value);
}

// This non-cryptographic fingerprint is only used to tell whether source copy
// changed after a translation was made. It is not an authentication token.
export function listingSourceFingerprint(listing: GooglePlayListingText): string {
  const value = `${listing.title}\n${listing.shortDescription}\n${listing.fullDescription}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function validateGooglePlayListingText(listing: GooglePlayListingText): string[] {
  const errors: string[] = [];
  if (!listing.title.trim()) errors.push("App title is required.");
  if (listing.title.length > 30) errors.push("App title exceeds Google Play's 30-character limit.");
  if (!listing.shortDescription.trim()) errors.push("Short description is required.");
  if (listing.shortDescription.length > 80) errors.push("Short description exceeds Google Play's 80-character limit.");
  if (!listing.fullDescription.trim()) errors.push("Full description is required.");
  if (listing.fullDescription.length > 4000) errors.push("Full description exceeds Google Play's 4,000-character limit.");
  return errors;
}

export function parseLocalizedStoreListings(value: string | null | undefined): LocalizedStoreListing[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): LocalizedStoreListing[] => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (!isGooglePlayTargetLocale(row.locale)) return [];
      if (typeof row.title !== "string" || typeof row.shortDescription !== "string" || typeof row.fullDescription !== "string") return [];
      return [{
        locale: row.locale,
        title: row.title,
        shortDescription: row.shortDescription,
        fullDescription: row.fullDescription,
        sourceHash: typeof row.sourceHash === "string" ? row.sourceHash : "",
        status: row.status === "ready" ? "ready" : "needs-review",
        updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : undefined,
      }];
    });
  } catch {
    return [];
  }
}

export function validateLocalizedStoreListings(value: unknown): LocalizedStoreListing[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item): LocalizedStoreListing[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (!isGooglePlayTargetLocale(row.locale) || seen.has(row.locale)) return [];
    if (typeof row.title !== "string" || typeof row.shortDescription !== "string" || typeof row.fullDescription !== "string") return [];
    const listing = { title: row.title, shortDescription: row.shortDescription, fullDescription: row.fullDescription };
    if (validateGooglePlayListingText(listing).length) return [];
    seen.add(row.locale);
    return [{
      locale: row.locale,
      ...listing,
      sourceHash: typeof row.sourceHash === "string" ? row.sourceHash : "",
      status: row.status === "ready" ? "ready" : "needs-review",
      updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : undefined,
    }];
  });
}
