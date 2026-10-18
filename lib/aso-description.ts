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
  keywords: { phrase: string; priority: "high" | "medium" | "low"; reason: string; coverage?:"exact"|"related"|"missing"; evidence?:string; relatedTerms?:string[] }[];
  recommendations: { kind: "policy-risk" | "editorial"; issue: string; action: string }[];
  suggestedDescription: string;
  sentenceEdits?:{original:string;replacement:string;reason:string}[];
};

export function parseDescriptionReview(raw: string,source?:string): DescriptionReview | null {
  try {
    const value = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
    if(source&&(typeof value.suggestedDescription!=="string"||!value.suggestedDescription.trim()))value.suggestedDescription=source;
    if (typeof value.summary !== "string" || !Array.isArray(value.keywords) || !Array.isArray(value.recommendations) || typeof value.suggestedDescription !== "string" || !value.suggestedDescription.trim() || (value.suggestedDescription.length > 4000 && value.suggestedDescription !== source)) return null;
    const keywords = value.keywords.filter((k: Record<string, unknown>) => k && typeof k.phrase === "string" && k.phrase.trim() && k.phrase.length <= 80 && ["high","medium","low"].includes(String(k.priority)) && typeof k.reason === "string").slice(0, 12);
    if (!keywords.length) return null;
    const normalized=(v:string)=>v.normalize("NFKC").replace(/\s+/g," ").trim();
    for(const k of keywords){
      if(k.coverage!==undefined&&!["exact","related","missing"].includes(k.coverage))return null;
      if(source&&k.coverage==="exact"&&!keywordOccurrences(source,k.phrase).length)return null;
      if(k.evidence!==undefined&&(typeof k.evidence!=="string"||k.evidence.length>600))return null;
      if(source&&k.evidence&&!normalized(source).includes(normalized(k.evidence)))return null;
      if(k.coverage==="related"&&!k.evidence?.trim())return null;
      if(k.relatedTerms!==undefined&&(!Array.isArray(k.relatedTerms)||k.relatedTerms.some((t:unknown)=>typeof t!=="string"||t.length>100)||k.relatedTerms.length>8))return null;
    }
    const sentenceEdits=Array.isArray(value.sentenceEdits)?value.sentenceEdits.slice(0,4):[];
    for(const e of sentenceEdits){if(!e||typeof e.original!=="string"||!e.original.trim()||e.original.length>900||typeof e.replacement!=="string"||!e.replacement.trim()||e.replacement.length>1000||typeof e.reason!=="string"||e.reason.length>600)return null;if(source&&(!source.includes(e.original)||source.indexOf(e.original)!==source.lastIndexOf(e.original)))return null;}
    return { summary:value.summary.slice(0,1500), keywords, recommendations:value.recommendations.filter((r: Record<string, unknown>) => r && ["policy-risk","editorial"].includes(String(r.kind)) && typeof r.issue === "string" && typeof r.action === "string").slice(0,10), suggestedDescription:value.suggestedDescription,sentenceEdits };
  } catch { return null; }
}
