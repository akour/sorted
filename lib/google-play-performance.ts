export const PLAY_PERFORMANCE_FIELDS = [
  "date",
  "locale",
  "country",
  "searchTerm",
  "trafficSource",
  "visitors",
  "installClicks",
  "openClicks",
  "preRegistrationClicks",
  "ctr",
  "conversionRate",
  "acquisitions",
] as const;

export type PlayPerformanceField = (typeof PLAY_PERFORMANCE_FIELDS)[number];
export type PlayPerformanceMapping = Partial<Record<PlayPerformanceField, number | null>>;
export type PlayPerformanceReportType = "click-intent" | "legacy-acquisition" | "mixed" | "unknown";

export type PlayPerformanceRow = {
  sourceRow: number;
  date: string;
  locale: string;
  country: string;
  searchTerm: string;
  trafficSource: string;
  visitors: number | null;
  installClicks: number | null;
  openClicks: number | null;
  preRegistrationClicks: number | null;
  ctr: string;
  conversionRate: string;
  acquisitions: number | null;
};

export type ParsedPlayCsv = { headers: string[]; rows: string[][]; delimiter: string };

const FIELD_ALIASES: Record<PlayPerformanceField, string[]> = {
  date: ["date", "day", "report date", "data date"],
  locale: ["locale", "language", "listing language", "language and region", "language region"],
  country: ["country", "region", "country region", "country/region"],
  searchTerm: ["search term", "search query", "search keyword", "keyword"],
  trafficSource: ["traffic source", "source", "store listing source"],
  visitors: ["visitors", "unique visitors", "store listing visitors", "unique store listing visitors"],
  installClicks: ["unique install clicks", "unique user install clicks", "install clicks", "user install clicks"],
  openClicks: ["unique open clicks", "unique user open clicks", "open clicks", "user open clicks"],
  preRegistrationClicks: ["unique pre registration clicks", "unique preregistration clicks", "unique user pre registration clicks", "unique user preregistration clicks", "pre registration clicks", "preregistration clicks", "pre registration button clicks"],
  ctr: ["ctr", "click through rate", "clickthrough rate", "click through rate ctr"],
  conversionRate: ["conversion rate", "store listing conversion rate", "acquisition conversion rate"],
  acquisitions: ["acquisitions", "store listing acquisitions", "unique acquisitions", "installs", "first time installers"],
};

const FIELD_LABELS: Record<PlayPerformanceField, string> = {
  date: "Report date",
  locale: "Language / locale",
  country: "Country / region",
  searchTerm: "Search term",
  trafficSource: "Traffic source",
  visitors: "Visitors",
  installClicks: "Unique install clicks",
  openClicks: "Unique open clicks",
  preRegistrationClicks: "Unique pre-registration clicks",
  ctr: "Click-through rate (CTR)",
  conversionRate: "Acquisition conversion rate",
  acquisitions: "Acquisitions / installs",
};

function normalizeHeader(value: string) {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function splitCsv(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') {
      if (cell.length) throw new Error("The CSV has a quote in the middle of a cell. Check the file and try again.");
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell); cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) throw new Error("The CSV contains an unfinished quoted cell. Check the file and try again.");
  row.push(cell);
  if (row.some((item) => item.trim())) rows.push(row);
  return rows;
}

export function parsePlayConsoleCsv(input: string): ParsedPlayCsv {
  const text = input.replace(/^\uFEFF/, "");
  const candidates = [",", "\t", ";"];
  const delimiter = candidates.map((candidate) => {
    try { return { candidate, width: splitCsv(text, candidate)[0]?.length ?? 0 }; }
    catch { return { candidate, width: 0 }; }
  }).sort((left, right) => right.width - left.width)[0]?.candidate ?? ",";
  const parsed = splitCsv(text, delimiter);
  if (parsed.length < 2 || parsed[0].length < 1) throw new Error("This file needs a header row and at least one data row. Export a CSV report from Google Play Console.");
  const headers = parsed[0].map((header) => header.trim());
  if (headers.some((header) => !header)) throw new Error("Every CSV column needs a header so it can be mapped safely.");
  const rows = parsed.slice(1).map((row) => headers.map((_, index) => row[index] ?? ""));
  return { headers, rows, delimiter };
}

export function suggestPlayPerformanceMapping(headers: string[]): PlayPerformanceMapping {
  const normalized = headers.map(normalizeHeader);
  const mapping: PlayPerformanceMapping = {};
  for (const field of PLAY_PERFORMANCE_FIELDS) {
    const aliases = FIELD_ALIASES[field].map(normalizeHeader);
    const index = normalized.findIndex((header) => aliases.includes(header));
    if (index >= 0) mapping[field] = index;
  }
  return mapping;
}

function parseCount(raw: string, fieldLabel: string, sourceRow: number): number | null {
  const value = raw.trim();
  if (!value || value === "—" || value === "-") return null;
  const normalized = /^(?:\d{1,3}(?:,\d{3})+|\d+)$/.test(value) ? value.replace(/,/g, "") : value;
  const count = Number(normalized);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error(`Row ${sourceRow}: ${fieldLabel} must be a non-negative whole number.`);
  return count;
}

function cellFor(row: string[], mapping: PlayPerformanceMapping, field: PlayPerformanceField) {
  const index = mapping[field];
  return typeof index === "number" ? (row[index] ?? "").trim() : "";
}

export function buildPlayPerformanceRows(headers: string[], sourceRows: string[][], mapping: PlayPerformanceMapping) {
  const assignedHeaders = new Map<number, PlayPerformanceField>();
  for (const field of PLAY_PERFORMANCE_FIELDS) {
    const index = mapping[field];
    if (typeof index !== "number") continue;
    const prior = assignedHeaders.get(index);
    if (prior) throw new Error(`The same CSV column cannot be mapped to both ${FIELD_LABELS[prior]} and ${FIELD_LABELS[field]}.`);
    assignedHeaders.set(index, field);
  }
  const hasClicks = ["installClicks", "openClicks", "preRegistrationClicks", "ctr"].some((field) => typeof mapping[field as PlayPerformanceField] === "number");
  const hasAcquisitions = typeof mapping.acquisitions === "number";
  if (!hasClicks && !hasAcquisitions) throw new Error("Map at least one click-intent metric or an acquisitions column to continue.");

  const rows = sourceRows.map((source, index): PlayPerformanceRow => {
    const sourceRow = index + 2;
    const row: PlayPerformanceRow = {
      sourceRow,
      date: cellFor(source, mapping, "date").slice(0, 80),
      locale: cellFor(source, mapping, "locale").slice(0, 80),
      country: cellFor(source, mapping, "country").slice(0, 80),
      searchTerm: cellFor(source, mapping, "searchTerm").slice(0, 300),
      trafficSource: cellFor(source, mapping, "trafficSource").slice(0, 120),
      visitors: parseCount(cellFor(source, mapping, "visitors"), FIELD_LABELS.visitors, sourceRow),
      installClicks: parseCount(cellFor(source, mapping, "installClicks"), FIELD_LABELS.installClicks, sourceRow),
      openClicks: parseCount(cellFor(source, mapping, "openClicks"), FIELD_LABELS.openClicks, sourceRow),
  preRegistrationClicks: parseCount(cellFor(source, mapping, "preRegistrationClicks"), FIELD_LABELS.preRegistrationClicks, sourceRow),
  ctr: cellFor(source, mapping, "ctr").slice(0, 40),
  conversionRate: cellFor(source, mapping, "conversionRate").slice(0, 40),
  acquisitions: parseCount(cellFor(source, mapping, "acquisitions"), FIELD_LABELS.acquisitions, sourceRow),
  };
    const hasObservation = [row.visitors, row.installClicks, row.openClicks, row.preRegistrationClicks, row.acquisitions].some((value) => value !== null) || Boolean(row.ctr || row.conversionRate);
    if (!hasObservation) throw new Error(`Row ${sourceRow}: no report metric value was found.`);
    return row;
  });
  const hasClickObservation = rows.some((row) => row.installClicks !== null || row.openClicks !== null || row.preRegistrationClicks !== null || Boolean(row.ctr));
  const hasAcquisitionObservation = rows.some((row) => row.acquisitions !== null || Boolean(row.conversionRate));
  if (!hasClickObservation && !hasAcquisitionObservation) throw new Error("No listing click, CTR, acquisition, or acquisition-conversion values were found in the mapped rows.");
  return { rows, reportType: hasClickObservation && hasAcquisitionObservation ? "mixed" as const : hasClickObservation ? "click-intent" as const : "legacy-acquisition" as const };
}

export function validateStoredPlayPerformanceRows(value: unknown): value is PlayPerformanceRow[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2_000) return false;
  return value.every((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const row = candidate as Record<string, unknown>;
    if (!Number.isSafeInteger(row.sourceRow) || (row.sourceRow as number) < 2) return false;
    for (const field of ["date", "locale", "country", "searchTerm", "trafficSource", "ctr", "conversionRate"] as const) {
      if (typeof row[field] !== "string" || row[field].length > ({ date: 80, locale: 80, country: 80, searchTerm: 300, trafficSource: 120, ctr: 40, conversionRate: 40 }[field])) return false;
    }
    for (const field of ["visitors", "installClicks", "openClicks", "preRegistrationClicks", "acquisitions"] as const) {
      if (row[field] !== null && (!Number.isSafeInteger(row[field]) || (row[field] as number) < 0)) return false;
    }
    return [row.visitors, row.installClicks, row.openClicks, row.preRegistrationClicks, row.acquisitions].some((metric) => metric !== null) || Boolean(row.ctr || row.conversionRate);
  });
}

export function classifyStoredPlayPerformanceRows(rows: PlayPerformanceRow[]): PlayPerformanceReportType {
  const hasClicks = rows.some((row) => row.installClicks !== null || row.openClicks !== null || row.preRegistrationClicks !== null || Boolean(row.ctr));
  const hasAcquisitions = rows.some((row) => row.acquisitions !== null || Boolean(row.conversionRate));
  if (!hasClicks && !hasAcquisitions) return "unknown";
  return hasClicks && hasAcquisitions ? "mixed" : hasClicks ? "click-intent" : "legacy-acquisition";
}

export function playPerformanceReportLabel(reportType: PlayPerformanceReportType) {
  return reportType === "click-intent" ? "Click-intent report" : reportType === "legacy-acquisition" ? "Legacy acquisition report" : reportType === "mixed" ? "Mixed click + acquisition report" : "Unclassified report";
}

export const PLAY_PERFORMANCE_FIELD_LABELS = FIELD_LABELS;
