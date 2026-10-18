export const PLAY_EXPERIMENT_METRICS = [
  "unique-install-clicks",
  "unique-open-clicks",
  "unique-pre-registration-clicks",
] as const;

export type PlayExperimentMetric = (typeof PLAY_EXPERIMENT_METRICS)[number];

export const PLAY_EXPERIMENT_STATUSES = [
  "planned",
  "running",
  "variant-won",
  "current-won",
  "draw",
  "more-data",
] as const;

export type PlayExperimentStatus = (typeof PLAY_EXPERIMENT_STATUSES)[number];

export type OptimizationExperiment = {
  id: string;
  opportunityTitle: string;
  opportunityArea: string;
  hypothesis: string;
  metric: PlayExperimentMetric;
  locale: string;
  status: PlayExperimentStatus;
  startDate: string;
  control: string;
  variant: string;
  resultNote: string;
  listingChange?: { savedAt:string; baselineFetchedAt:string; reason:string; keywords:string; measurementPlan:string };
};

export function createOptimizationExperiment(opportunityTitle: string, opportunityArea: string, id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`): OptimizationExperiment {
  return {
    id,
    opportunityTitle,
    opportunityArea,
    hypothesis: "",
    metric: "unique-install-clicks",
    locale: "Default listing language",
    status: "planned",
    startDate: "",
    control: "",
    variant: "",
    resultNote: "",
  };
}

function isChoice<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === "string" && choices.includes(value as T);
}

export function normalizeOptimizationExperiment(value: unknown): OptimizationExperiment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.opportunityTitle !== "string") return null;
  const stringValue = (field: unknown, fallback = "") => typeof field === "string" ? field : fallback;
  return {
    id: item.id,
    opportunityTitle: item.opportunityTitle,
    opportunityArea: stringValue(item.opportunityArea, "ASO"),
    hypothesis: stringValue(item.hypothesis),
    metric: isChoice(item.metric, PLAY_EXPERIMENT_METRICS) ? item.metric : "unique-install-clicks",
    locale: stringValue(item.locale, "Default listing language"),
    status: isChoice(item.status, PLAY_EXPERIMENT_STATUSES) ? item.status : "planned",
    startDate: stringValue(item.startDate),
    control: stringValue(item.control),
    variant: stringValue(item.variant),
    resultNote: stringValue(item.resultNote),
    ...(normalizeListingChange(item.listingChange) ? {listingChange:normalizeListingChange(item.listingChange)!} : {}),
  };
}

function normalizeListingChange(value:unknown):OptimizationExperiment["listingChange"] {
  if(!value||typeof value!=="object"||Array.isArray(value))return undefined;
  const v=value as Record<string,unknown>;
  if(typeof v.savedAt!=="string"||typeof v.reason!=="string")return undefined;
  const str=(key:string,max:number)=>typeof v[key]==="string"?(v[key] as string).slice(0,max):"";
  return {savedAt:str("savedAt",40),baselineFetchedAt:str("baselineFetchedAt",40),reason:str("reason",2000),keywords:str("keywords",1000),measurementPlan:str("measurementPlan",3000)};
}

export function createListingChange(input:{before:string;after:string;baselineFetchedAt:string;reason:string;keywords:string;measurementPlan:string;metric:PlayExperimentMetric},now=new Date().toISOString()):OptimizationExperiment {
  if(!input.reason.trim()||!input.measurementPlan.trim())throw new Error("Add a reason and measurement plan first.");
  if(input.before.trim()===input.after.trim())throw new Error("Edit the listing before capturing a change.");
  const plan=createOptimizationExperiment("English listing change","Google Play listing");
  return {...plan,locale:"en-US",metric:input.metric,hypothesis:input.reason.trim(),control:input.before,variant:input.after,listingChange:{savedAt:now,baselineFetchedAt:input.baselineFetchedAt,reason:input.reason.trim().slice(0,2000),keywords:input.keywords.trim().slice(0,1000),measurementPlan:input.measurementPlan.trim().slice(0,3000)}};
}

export function parseOptimizationStorage(raw: string | null | undefined) {
  try {
    const parsed: unknown = JSON.parse(raw ?? "");
    if (Array.isArray(parsed)) return { opportunities: parsed, experiments: [] as OptimizationExperiment[] };
    if (parsed && typeof parsed === "object") {
      const stored = parsed as { opportunities?: unknown; experiments?: unknown };
      return {
        opportunities: Array.isArray(stored.opportunities) ? stored.opportunities : [],
        experiments: Array.isArray(stored.experiments) ? stored.experiments.map(normalizeOptimizationExperiment).filter((item): item is OptimizationExperiment => Boolean(item)) : [],
      };
    }
  } catch {
    // Older or malformed rows should still open as an empty optimization queue.
  }
  return { opportunities: [], experiments: [] as OptimizationExperiment[] };
}

export function stringifyOptimizationStorage(opportunities: unknown[], experiments: unknown[]) {
  return JSON.stringify({
    opportunities,
    experiments: experiments.map(normalizeOptimizationExperiment).filter((item): item is OptimizationExperiment => Boolean(item)),
  });
}
