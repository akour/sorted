import {z} from "zod";

const quote=z.string().max(450);
const analysisSchema=z.object({
  summary:z.string().min(10).max(1800),
  identity:z.object({whatItIs:z.string().max(900),audience:z.string().max(900),benefit:z.string().max(900),uncertainties:z.array(z.string().max(500)).max(8)}),
  answers:z.array(z.object({question:z.string().max(240),answer:z.string().max(1200),evidenceQuotes:z.array(quote).max(3)})).min(1).max(6),
  gaps:z.array(z.object({priority:z.enum(["high","medium","low"]),issue:z.string().max(500),recommendation:z.string().max(900),evidenceQuote:quote,suggestedCopy:z.string().max(1500)})).max(6),
  discoveryPrompts:z.array(z.string().min(5).max(500)).max(6),
});
export type WebsiteAnalysis=z.infer<typeof analysisSchema>;
export type WebsiteUnderstandingReport={url:string;fetchedAt:string;model:string;pageTitle:string;contentHash:string;text:string;truncated:boolean;analysis:WebsiteAnalysis};
export function normalizedEvidence(text:string) {return text.normalize("NFKC").replace(/\s+/g," ").trim();}
export function parseWebsiteAnalysis(raw:string,source:string):WebsiteAnalysis|null {
  try {
    const result=analysisSchema.safeParse(JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw));
    if(!result.success)return null;
    const evidence=normalizedEvidence(source);
    const quotes=[...result.data.answers.flatMap(a=>a.evidenceQuotes),...result.data.gaps.map(g=>g.evidenceQuote).filter(Boolean)];
    if(!quotes.length || quotes.some(q=>!q.trim() || !evidence.includes(normalizedEvidence(q))))return null;
    return result.data;
  }catch{return null;}
}
export function publicWebsiteTarget(raw:string,base?:string) {
  const url=new URL(raw,base);
  if(url.protocol!=="https:" || url.username || url.password || (url.port && url.port!=="443"))throw new Error("Use a public HTTPS page without credentials or a custom port.");
  if(!url.hostname.includes(".") || /[:\[\]]/.test(url.hostname) || /^(?:\d+\.)+\d+$/.test(url.hostname) || /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(url.hostname) || url.hostname==="metadata.google.internal")throw new Error("Use a public website domain.");
  if(base && url.origin!==new URL(base).origin)throw new Error("Choose a page on this product’s saved website.");
  url.hash="";return url;
}
function decode(value:string) {return value.replace(/&(?:amp|quot|apos|lt|gt|nbsp|#\d+|#x[\da-f]+);/gi,entity=>{
  const code=entity.slice(1,-1);const named:Record<string,string>={amp:"&",quot:'"',apos:"'",lt:"<",gt:">",nbsp:" "};
  if(code[0]!=="#")return named[code.toLowerCase()]||entity;
  const point=code[1]?.toLowerCase()==="x"?parseInt(code.slice(2),16):parseInt(code.slice(1),10);
  return point>=0&&point<=0x10ffff?String.fromCodePoint(point):entity;
});}
export function extractPublicText(html:string) {
  const title=decode((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/<[^>]*>/g," ")).trim();
  const clean=html.replace(/<!--[\s\S]*?-->/g," ").replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi," ");
  const text=normalizedEvidence(decode(clean.replace(/<[^>]*>/g," ")));
  return {pageTitle:title,text:text.slice(0,18000),truncated:text.length>18000};
}
export async function readProductPage(url:URL) {
  const response=await fetch(url,{redirect:"manual",signal:AbortSignal.timeout(12000),headers:{accept:"text/html,application/xhtml+xml","user-agent":"Sorted/1.0 public-page-review"}});
  if(response.status>=300&&response.status<400)throw new Error("This page redirects. Save or select its final HTTPS URL before reviewing it.");
  if(!response.ok)throw new Error(`The public page returned HTTP ${response.status}.`);
  if(!/text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") || ""))throw new Error("The URL did not return an HTML page.");
  const reader=response.body?.getReader();if(!reader)throw new Error("The page returned no content.");
  const decoder=new TextDecoder();let html="",bytes=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1_000_000)throw new Error("The page exceeds the 1 MB review limit.");html+=decoder.decode(value,{stream:true});}html+=decoder.decode();}finally{await reader.cancel().catch(()=>{});}
  const page=extractPublicText(html);
  if(page.text.length<100)throw new Error("Too little page text was returned. This review reads server-delivered HTML and does not render JavaScript-only content.");
  return page;
}
