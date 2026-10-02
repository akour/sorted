import { getOptimizationDraftIssues } from "./optimization-quality";

type ResearchFields = { intent?: string | null; semanticCore?: string | null } | null | undefined;
type OptimizationFields = {
  storeTitle?: string | null;
  storeSubtitle?: string | null;
  storeShortDescription?: string | null;
  storeLongDescription?: string | null;
  answerSummary?: string | null;
  currentListing?: unknown;
} | null | undefined;
type CreateFields = {
  status?: string | null;
  primaryMessage?: string | null;
  storeVariants?: string | null;
  answerBlocks?: string | null;
  promoBrief?: string | null;
  creativeBrief?: string | null;
} | null | undefined;

export type PublishReadiness = { research: boolean; optimize: boolean; create: boolean };

function parseArray(value: string | null | undefined): unknown[] {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseObject(value: string | null | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function containsText(value: unknown): boolean {
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.some(containsText);
  if (value && typeof value === "object") return Object.values(value).some(containsText);
  return false;
}

export function hasCreateBriefContent(brief: CreateFields) {
  if (!brief) return false;
  return Boolean(brief.primaryMessage?.trim())
    || containsText(parseArray(brief.storeVariants))
    || containsText(parseArray(brief.answerBlocks))
    || containsText(parseObject(brief.promoBrief))
    || containsText(parseObject(brief.creativeBrief));
}

export function getPublishReadiness({ research, optimization, create }: {
  research?: ResearchFields;
  optimization?: OptimizationFields;
  create?: CreateFields;
}): PublishReadiness {
  return {
    research: Boolean(research?.intent?.trim() && research.semanticCore?.trim()),
    optimize: Boolean(optimization && getOptimizationDraftIssues(optimization).length === 0),
    create: create?.status === "approved" && hasCreateBriefContent(create),
  };
}

export function isPublishChecklistComplete(checklist: unknown): boolean {
  return Array.isArray(checklist)
    && checklist.length > 0
    && checklist.every((item) => Boolean(item && typeof item === "object" && !Array.isArray(item) && (item as Record<string, unknown>).done === true));
}

export function canMarkPublishReady(readiness: PublishReadiness, checklist: unknown): boolean {
  return readiness.research && readiness.optimize && readiness.create && isPublishChecklistComplete(checklist);
}
