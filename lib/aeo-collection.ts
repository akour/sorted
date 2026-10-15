export type AeoApiModel = {id:string;name:string;provider:string};
export const AEO_WEB_ENGINES = [
  {name:"ChatGPT",url:"https://chatgpt.com/"},
  {name:"Gemini",url:"https://gemini.google.com/"},
  {name:"Claude",url:"https://claude.ai/"},
  {name:"Perplexity",url:"https://www.perplexity.ai/"},
  {name:"Copilot",url:"https://copilot.microsoft.com/"},
  {name:"Google AI Overviews",url:"https://www.google.com/"},
];

// Comparisons must never substitute a fallback and then label it as the selected model.
export function aeoProbeModels(configured:string[],requested:unknown):string[] | null {
  const allowed=[...new Set(configured.filter(Boolean))];
  if (requested===undefined) return allowed;
  return typeof requested==="string" && allowed.includes(requested) ? [requested] : null;
}
