export const AEO_ENGINES = ["ChatGPT", "Gemini", "Claude", "Perplexity", "Google AI Overviews", "Copilot", "Other", "Configured API"] as const;
export type AeoEngine = typeof AEO_ENGINES[number];
export type Identification = "unreviewed" | "correct" | "confused" | "unknown";
export type AeoPrompt = { id:string; text:string; intent:"brand" | "discovery" | "comparison"; language:string; country:string };
export type AeoConfig = { prompts:AeoPrompt[]; competitors:string[] };
export type AeoObservation = { id?:number; promptId:string; prompt:string; engine:AeoEngine; source:"manual" | "api"; testMode?:"discovery" | "memory" | "unverified"; searchEnabled?:boolean; model:string; answer:string; citations:string[]; evidenceUrl:string; identification:Identification; notes:string; observedAt:string; language:string; country:string };

export function isDiscoveryObservation(row:AeoObservation) {return row.source==="manual" && row.testMode==="discovery" && row.searchEnabled===true;}

export function safeAeoUrl(value:unknown) {
  if (typeof value !== "string" || value.length > 2000) return "";
  try {const url = new URL(value);return ["http:","https:"].includes(url.protocol) ? url.toString() : "";} catch {return "";}
}
export function siteHost(url:string) { try {return new URL(url).hostname.replace(/^www\./,"").toLowerCase();} catch {return "";} }
export function isOwnedCitation(citation:string,website:string) {
  const host=siteHost(citation), owned=siteHost(website);
  return Boolean(host && owned && (host === owned || host.endsWith(`.${owned}`)));
}
export function containsBrand(answer:string, name:string, website:string) {
  const text=answer.normalize("NFKC").toLowerCase();
  const label=name.trim().normalize("NFKC").toLowerCase();
  const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  return Boolean(label && new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,"u").test(text)) || Boolean(siteHost(website) && text.includes(siteHost(website)));
}
export function defaultAeoConfig(name:string,website:string):AeoConfig {
  return {competitors:[],prompts:[
    {id:"brand-overview",text:`What is the brand at ${siteHost(website) || name}? What does it do, who is it for, and how does it compare with alternatives?`,intent:"brand",language:"English",country:""},
    {id:"brand-audience",text:`Who is ${name} for, and what problems does it help solve?`,intent:"brand",language:"English",country:""},
    {id:"brand-comparison",text:`What are the alternatives to ${name}, and how do they differ?`,intent:"comparison",language:"English",country:""},
  ]};
}
export function normalizeAeoConfig(value:unknown):AeoConfig {
  const input=value && typeof value === "object" ? value as Record<string,unknown> : {};
  const seen=new Set<string>();
  const prompts=(Array.isArray(input.prompts) ? input.prompts : []).flatMap((row:unknown)=>{
    if (!row || typeof row !== "object") return [];
    const item=row as Record<string,unknown>;
    if (typeof item.id !== "string" || !/^[a-z0-9-]{1,80}$/i.test(item.id) || seen.has(item.id) || typeof item.text !== "string" || !item.text.trim()) return [];
    seen.add(item.id);
    return [{id:item.id,text:item.text.trim().slice(0,1000),intent:["brand","discovery","comparison"].includes(String(item.intent)) ? item.intent as AeoPrompt["intent"] : "brand",language:typeof item.language === "string" ? item.language.slice(0,50) : "English",country:typeof item.country === "string" ? item.country.slice(0,60) : ""}];
  }).slice(0,30);
  const competitors=[...new Set((Array.isArray(input.competitors) ? input.competitors : []).filter((v:unknown):v is string=>typeof v === "string").map(v=>v.trim().slice(0,100)).filter(Boolean))].slice(0,12);
  return {prompts,competitors};
}
export function normalizeAeoObservation(value:unknown):AeoObservation | null {
  if (!value || typeof value !== "object") return null;
  const v=value as Record<string,unknown>;
  if (typeof v.answer !== "string" || !v.answer.trim() || v.answer.length > 30000 || typeof v.prompt !== "string" || !v.prompt.trim() || v.prompt.length > 1000 || !AEO_ENGINES.includes(v.engine as AeoEngine)) return null;
  const date=typeof v.observedAt === "string" ? new Date(v.observedAt) : null;
  if (!date || !Number.isFinite(date.getTime()) || date.getTime() > Date.now()+300000) return null;
  return {promptId:typeof v.promptId === "string" ? v.promptId.slice(0,80) : "",prompt:v.prompt,engine:v.engine as AeoEngine,source:v.source === "api" ? "api" : "manual",testMode:v.source==="api"?"memory":v.testMode==="discovery"&&v.searchEnabled===true?"discovery":"unverified",searchEnabled:v.source!=="api"&&v.searchEnabled===true,model:typeof v.model === "string" ? v.model.slice(0,120) : "",answer:v.answer.trim(),citations:[...new Set((Array.isArray(v.citations) ? v.citations : []).map(safeAeoUrl).filter(Boolean))].slice(0,30),evidenceUrl:safeAeoUrl(v.evidenceUrl),identification:["correct","confused","unknown"].includes(String(v.identification)) ? v.identification as Identification : "unreviewed",notes:typeof v.notes === "string" ? v.notes.slice(0,2000) : "",observedAt:date.toISOString(),language:typeof v.language === "string" ? v.language.slice(0,50) : "",country:typeof v.country === "string" ? v.country.slice(0,60) : ""};
}
export function aeoMetrics(rows:AeoObservation[],name:string,website:string) {
  const reviewed=rows.filter(r=>r.identification !== "unreviewed");
  const mentioned=rows.filter(r=>containsBrand(r.answer,name,website)).length;
  const cited=rows.filter(r=>r.citations.some(url=>isOwnedCitation(url,website))).length;
  const correct=reviewed.filter(r=>r.identification === "correct").length;
  return {total:rows.length,mentioned,cited,reviewed:reviewed.length,correct,confused:reviewed.filter(r=>r.identification === "confused").length,mentionRate:rows.length ? Math.round(100*mentioned/rows.length) : null,citationRate:rows.length ? Math.round(100*cited/rows.length) : null,recognitionRate:reviewed.length ? Math.round(100*correct/reviewed.length) : null};
}
