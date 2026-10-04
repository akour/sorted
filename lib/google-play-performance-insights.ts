import type { PlayPerformanceRow } from "./google-play-performance";

export type PerformancePromotion = {
  id: number;
  title: string;
  eventType: string;
  status: string;
  startDate: string;
  endDate: string;
};

export type PerformanceOpportunity = {
  title: string;
  area: string;
  impact?: string;
  effort?: string;
  rationale?: string;
  status: string;
};

export type PerformanceExperiment = {
  opportunityTitle: string;
  opportunityArea: string;
  hypothesis: string;
  metric: string;
  locale: string;
  status: string;
  startDate: string;
};

export type LocalePerformanceObservation = {
  locale: string;
  rows: number;
  latestDate: string;
  latest: PlayPerformanceRow | null;
  ambiguous: boolean;
};

export function isIsoCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Selects an exact source observation per locale. It deliberately does not sum
 * rows or average rates: report breakdowns can overlap and must stay distinct.
 */
export function summarizeLocaleObservations(rows: PlayPerformanceRow[]): LocalePerformanceObservation[] {
  const grouped = new Map<string, PlayPerformanceRow[]>();
  for (const row of rows) {
    const locale = row.locale.trim() || "Locale not provided";
    grouped.set(locale, [...(grouped.get(locale) ?? []), row]);
  }

  return [...grouped.entries()].map(([locale, observations]) => {
    const dated = observations.filter((row) => isIsoCalendarDate(row.date)).sort((a, b) => b.date.localeCompare(a.date));
    const latestDate = dated[0]?.date ?? "";
    const latestRows = latestDate ? dated.filter((row) => row.date === latestDate) : observations;
    const latest = latestRows.length === 1 ? latestRows[0] : null;
    return { locale, rows: observations.length, latestDate, latest, ambiguous: latestRows.length > 1 };
  }).sort((a, b) => a.locale.localeCompare(b.locale));
}

export function findOverlappingPromotions(
  promotions: PerformancePromotion[],
  dateStart: string,
  dateEnd: string,
) {
  if (!isIsoCalendarDate(dateStart) || !isIsoCalendarDate(dateEnd) || dateStart > dateEnd) return [];
  return promotions.filter((event) => {
    const start = event.startDate || event.endDate;
    const end = event.endDate || event.startDate;
    return isIsoCalendarDate(start) && isIsoCalendarDate(end) && start <= dateEnd && end >= dateStart;
  }).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id);
}

export function chooseNextAsoStep(
  opportunities: PerformanceOpportunity[],
  experiments: PerformanceExperiment[],
) {
  const active = experiments.find((item) => /^(planned|running)$/.test(item.status));
  if (active) return { kind: "active-experiment" as const, experiment: active, opportunity: null };
  const opportunity = opportunities.find((item) => item && typeof item.title === "string" &&
    typeof item.area === "string" && typeof item.status === "string" &&
    !/aeo/i.test(item.area) && item.status !== "done" && item.title.trim(),
  );
  return opportunity
    ? { kind: "saved-opportunity" as const, experiment: null, opportunity }
    : { kind: "none" as const, experiment: null, opportunity: null };
}
