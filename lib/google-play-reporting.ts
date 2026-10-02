export const GOOGLE_PLAY_REPORTING_API_ROOT = "https://playdeveloperreporting.googleapis.com/v1beta1";
export const GOOGLE_PLAY_REPORTING_SCOPE = "https://www.googleapis.com/auth/playdeveloperreporting";
const REPORTING_TIME_ZONE = "America/Los_Angeles";

export type GooglePlayQualityRow = {
  date: string;
  crashRate28dUserWeighted: string | null;
  userPerceivedCrashRate28dUserWeighted: string | null;
  anrRate28dUserWeighted: string | null;
  userPerceivedAnrRate28dUserWeighted: string | null;
};

export type GooglePlayQualitySnapshot = {
  packageName: string;
  dateStart: string;
  dateEnd: string;
  syncedAt: string;
  rows: GooglePlayQualityRow[];
};

type ReportingFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function reportingDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORTING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")) };
}

function dateString(value: { year: number; month: number; day: number }) {
  return `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

export function googlePlayReportingDateRange(now = new Date()) {
  const end = reportingDate(now);
  const endUtc = Date.UTC(end.year, end.month - 1, end.day);
  const startDate = new Date(endUtc - 30 * 24 * 60 * 60 * 1000);
  const lastIncludedDate = new Date(endUtc - 24 * 60 * 60 * 1000);
  const start = { year: startDate.getUTCFullYear(), month: startDate.getUTCMonth() + 1, day: startDate.getUTCDate() };
  return {
    dateStart: dateString(start),
    // Google treats timelineSpec.endTime as exclusive; expose the final
    // requested calendar day as an inclusive date to callers.
    dateEnd: dateString({ year: lastIncludedDate.getUTCFullYear(), month: lastIncludedDate.getUTCMonth() + 1, day: lastIncludedDate.getUTCDate() }),
    timelineSpec: {
      aggregationPeriod: "DAILY",
      startTime: { ...start, timeZone: REPORTING_TIME_ZONE },
      endTime: { ...end, timeZone: REPORTING_TIME_ZONE },
    },
  };
}

function decimalString(value: unknown): string | null {
  if (typeof value === "string" && value.trim() && value.length <= 64 && Number.isFinite(Number(value))) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function validDate(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const fields = value as Record<string, unknown>;
  const year = Number(fields.year);
  const month = Number(fields.month);
  const day = Number(fields.day);
  if (!Number.isSafeInteger(year) || !Number.isSafeInteger(month) || !Number.isSafeInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return "";
  return dateString({ year, month, day });
}

export function parseGooglePlayQualityMetricRows(value: unknown, metricNames: readonly string[]): Map<string, Record<string, string | null>> {
  const result = new Map<string, Record<string, string | null>>();
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  const rows = (value as Record<string, unknown>).rows;
  if (!Array.isArray(rows)) return result;
  for (const candidate of rows) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const row = candidate as Record<string, unknown>;
    const date = validDate(row.startTime);
    if (!date || !Array.isArray(row.metrics)) continue;
    const metrics: Record<string, string | null> = {};
    for (const metricCandidate of row.metrics) {
      if (!metricCandidate || typeof metricCandidate !== "object" || Array.isArray(metricCandidate)) continue;
      const metric = metricCandidate as Record<string, unknown>;
      if (typeof metric.metric !== "string" || !metricNames.includes(metric.metric)) continue;
      metrics[metric.metric] = decimalString(metric.decimalValue);
    }
    if (Object.keys(metrics).length > 0) result.set(date, { ...(result.get(date) ?? {}), ...metrics });
  }
  return result;
}

async function queryMetricSet(input: {
  packageName: string;
  metricSet: "crashRateMetricSet" | "anrRateMetricSet";
  metrics: readonly string[];
  accessToken: string;
  timelineSpec: ReturnType<typeof googlePlayReportingDateRange>["timelineSpec"];
  fetcher: ReportingFetch;
}) {
  const { packageName, metricSet, metrics, accessToken, timelineSpec, fetcher } = input;
  const url = `${GOOGLE_PLAY_REPORTING_API_ROOT}/apps/${encodeURIComponent(packageName)}/${metricSet}:query`;
  const response = await fetcher(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ timelineSpec, metrics, pageSize: 100, userCohort: "OS_PUBLIC" }),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : {};
    const detail = typeof error.message === "string" ? error.message.trim() : "";
    if (response.status === 401 || response.status === 403) {
      throw new Error("Google Play Reporting denied access. Reconnect this product’s Google Play account to grant reporting access, and confirm that account has read access to the app in Play Console.");
    }
    if (response.status === 404) {
      throw new Error("Google Play Reporting could not find this app. Confirm the package name and enable the Google Play Developer Reporting API in the connected Google Cloud project.");
    }
    throw new Error(detail.slice(0, 240) || "Google Play could not return the requested quality report.");
  }
  return payload;
}

export async function fetchGooglePlayQualitySnapshot(input: {
  packageName: string;
  accessToken: string;
  now?: Date;
  syncedAt?: string;
  fetcher?: ReportingFetch;
}): Promise<GooglePlayQualitySnapshot> {
  const fetcher = input.fetcher ?? fetch;
  const range = googlePlayReportingDateRange(input.now);
  const [crashPayload, anrPayload] = await Promise.all([
    queryMetricSet({
      packageName: input.packageName,
      metricSet: "crashRateMetricSet",
      metrics: ["crashRate28dUserWeighted", "userPerceivedCrashRate28dUserWeighted"],
      accessToken: input.accessToken,
      timelineSpec: range.timelineSpec,
      fetcher,
    }),
    queryMetricSet({
      packageName: input.packageName,
      metricSet: "anrRateMetricSet",
      metrics: ["anrRate28dUserWeighted", "userPerceivedAnrRate28dUserWeighted"],
      accessToken: input.accessToken,
      timelineSpec: range.timelineSpec,
      fetcher,
    }),
  ]);
  const crashRows = parseGooglePlayQualityMetricRows(crashPayload, ["crashRate28dUserWeighted", "userPerceivedCrashRate28dUserWeighted"]);
  const anrRows = parseGooglePlayQualityMetricRows(anrPayload, ["anrRate28dUserWeighted", "userPerceivedAnrRate28dUserWeighted"]);
  const dates = [...new Set([...crashRows.keys(), ...anrRows.keys()])].sort();
  const rows = dates.map((date): GooglePlayQualityRow => ({
    date,
    crashRate28dUserWeighted: crashRows.get(date)?.crashRate28dUserWeighted ?? null,
    userPerceivedCrashRate28dUserWeighted: crashRows.get(date)?.userPerceivedCrashRate28dUserWeighted ?? null,
    anrRate28dUserWeighted: anrRows.get(date)?.anrRate28dUserWeighted ?? null,
    userPerceivedAnrRate28dUserWeighted: anrRows.get(date)?.userPerceivedAnrRate28dUserWeighted ?? null,
  }));
  return {
    packageName: input.packageName,
    dateStart: range.dateStart,
    dateEnd: range.dateEnd,
    syncedAt: input.syncedAt ?? new Date().toISOString(),
    rows,
  };
}
