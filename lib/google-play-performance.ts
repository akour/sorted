export type GooglePlayPerformanceRow = {
  reportDate: string;
  countryCode: string;
  dailyViewers: number | null;
  rolling28Viewers: number | null;
  dailyConverters: number | null;
  rolling28Converters: number | null;
  dailyConversionRate: string | null;
  rolling28ConversionRate: string | null;
};

const MAX_ROWS = 5_000;

const HEADER_ALIASES: Record<string, string[]> = {
  eventId: ["eventid"],
  date: ["date", "reportdate"],
  country: ["country", "countryregion", "countryorregion"],
  dailyViewers: ["totaluniqueviewersdaily", "uniqueviewersdaily"],
  rolling28Viewers: ["totaluniqueviewerslast28days", "uniqueviewerslast28days"],
  dailyConverters: ["totaluniqueconvertersdaily", "uniqueconvertersdaily"],
  rolling28Converters: ["totaluniqueconverterslast28days", "uniqueconverterslast28days"],
  dailyConversionRate: ["conversionratedaily"],
  rolling28ConversionRate: ["conversionratelast28days"],
};

function normalizeHeader(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCsvRecords(source: string): string[][] {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((item) => item.trim())) records.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("The Google Play CSV has an unfinished quoted field.");
  row.push(field);
  if (row.some((item) => item.trim())) records.push(row);
  return records;
}

function parseDate(value: string, rowNumber: number) {
  const trimmed = value.trim();
  let isoDate = trimmed;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [month, day, year] = trimmed.split("/");
    isoDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new Error(`Row ${rowNumber}: the date is not a supported YYYY-MM-DD or MM/DD/YYYY date.`);
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== isoDate) {
    throw new Error(`Row ${rowNumber}: the date is invalid.`);
  }
  return isoDate;
}

function parseMetric(value: string, rowNumber: number, label: string, integerOnly: boolean): number | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—" || trimmed === "-") return null;
  const normalized = trimmed.replaceAll(",", "").replace(/\s/g, "").replace(/%$/, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || (integerOnly && !Number.isSafeInteger(parsed))) {
    throw new Error(`Row ${rowNumber}: ${label} must be a non-negative ${integerOnly ? "whole number" : "number"}.`);
  }
  return parsed;
}

function parseRate(value: string, rowNumber: number, label: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—" || trimmed === "-") return null;
  const normalized = trimmed.replaceAll(",", "").replace(/\s/g, "").replace(/%$/, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`Row ${rowNumber}: ${label} must be a rate between 0 and 100.`);
  }
  // Preserve Google's displayed representation because CSV exports may
  // encode percentages differently; Sorted must not silently rescale it.
  return trimmed;
}

function normalizeCountry(value: string) {
  const country = value.trim();
  if (!country || /^(all|all countries|total)$/i.test(country)) return "ALL";
  return country.toUpperCase();
}

/** Parse Google's Play Console promotional-content CSV for exactly one event. */
export function parseGooglePlayPerformanceCsv(csv: string, expectedEventId: string): GooglePlayPerformanceRow[] {
  if (!expectedEventId.trim()) throw new Error("Add the Google Play Console event ID to this event before importing a report.");
  const records = parseCsvRecords(csv);
  if (records.length < 2) throw new Error("The Google Play CSV has no report rows.");
  if (records.length - 1 > MAX_ROWS) throw new Error(`The Google Play CSV exceeds the ${MAX_ROWS.toLocaleString()}-row import limit. Export a shorter date range.`);

  const rawHeaders = records[0].map(normalizeHeader);
  const indexes = new Map<string, number>();
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const matches = rawHeaders.flatMap((header, index) => aliases.includes(header) ? [index] : []);
    if (matches.length > 1) throw new Error(`The Google Play CSV has duplicate columns for ${key}.`);
    if (matches.length === 1) indexes.set(key, matches[0]);
  }
  const required = Object.keys(HEADER_ALIASES);
  const missing = required.filter((key) => !indexes.has(key));
  if (missing.length) {
    throw new Error(`This CSV is missing Google Play report columns: ${missing.join(", ")}. Download the Promotional content report from Play Console.`);
  }

  const rows: GooglePlayPerformanceRow[] = [];
  const uniqueKeys = new Set<string>();
  for (let recordIndex = 1; recordIndex < records.length; recordIndex += 1) {
    const cells = records[recordIndex];
    const rowNumber = recordIndex + 1;
    if (cells.length !== rawHeaders.length) throw new Error(`Row ${rowNumber}: the number of cells does not match the CSV header.`);
    const get = (key: string) => cells[indexes.get(key)!] ?? "";
    const rowEventId = get("eventId").trim();
    if (/[;,|\n]/.test(rowEventId)) {
      throw new Error(`Row ${rowNumber}: this report combines multiple Play event IDs. Export one event at a time so results cannot be assigned to the wrong plan.`);
    }
    if (rowEventId !== expectedEventId.trim()) {
      throw new Error(`Row ${rowNumber}: Play event ID “${rowEventId || "(blank)"}” does not match this event’s saved Console ID.`);
    }
    const reportDate = parseDate(get("date"), rowNumber);
    const countryCode = normalizeCountry(get("country"));
    const key = `${reportDate}\u0000${countryCode}`;
    if (uniqueKeys.has(key)) throw new Error(`Row ${rowNumber}: this date and country appear more than once. Export a report with one event selected.`);
    uniqueKeys.add(key);
    rows.push({
      reportDate,
      countryCode,
      dailyViewers: parseMetric(get("dailyViewers"), rowNumber, "daily viewers", true),
      rolling28Viewers: parseMetric(get("rolling28Viewers"), rowNumber, "28-day viewers", true),
      dailyConverters: parseMetric(get("dailyConverters"), rowNumber, "daily converters", true),
      rolling28Converters: parseMetric(get("rolling28Converters"), rowNumber, "28-day converters", true),
      dailyConversionRate: parseRate(get("dailyConversionRate"), rowNumber, "daily conversion rate"),
      rolling28ConversionRate: parseRate(get("rolling28ConversionRate"), rowNumber, "28-day conversion rate"),
    });
  }
  return rows;
}
