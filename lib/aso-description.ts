export const PLAY_DESCRIPTION_GUIDANCE = {
  reviewedOn: "2026-10-15",
  metadataUrl: "https://support.google.com/googleplay/android-developer/answer/9898842?hl=en",
  listingUrl: "https://support.google.com/googleplay/android-developer/answer/9859152?hl=en",
};

export function keywordOccurrences(text: string, phrase: string) {
  if (!phrase.trim()) return [];
  const escaped = phrase.trim().split(/\s+/).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  const expression = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
  return [...text.matchAll(expression)].map(match => ({ start: match.index!, end: match.index! + match[0].length }));
}

export type DescriptionReview = {
  summary: string;
  keywords: { phrase: string; priority: "high" | "medium" | "low"; reason: string }[];
  recommendations: { kind: "policy-risk" | "editorial"; issue: string; action: string }[];
  suggestedDescription: string;
};

export function parseDescriptionReview(raw: string): DescriptionReview | null {
  try {
    const value = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
    if (typeof value.summary !== "string" || !Array.isArray(value.keywords) || !Array.isArray(value.recommendations) || typeof value.suggestedDescription !== "string" || !value.suggestedDescription.trim() || value.suggestedDescription.length > 4000) return null;
    const keywords = value.keywords.filter((k: Record<string, unknown>) => k && typeof k.phrase === "string" && k.phrase.trim() && k.phrase.length <= 80 && ["high","medium","low"].includes(String(k.priority)) && typeof k.reason === "string").slice(0, 12);
    if (!keywords.length) return null;
    return { summary:value.summary.slice(0,1500), keywords, recommendations:value.recommendations.filter((r: Record<string, unknown>) => r && ["policy-risk","editorial"].includes(String(r.kind)) && typeof r.issue === "string" && typeof r.action === "string").slice(0,10), suggestedDescription:value.suggestedDescription };
  } catch { return null; }
}
