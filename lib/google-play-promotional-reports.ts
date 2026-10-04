export const GOOGLE_PLAY_PROMOTIONAL_REPORT_PREFIX = "stats/promotional_content/";
export const GOOGLE_CLOUD_STORAGE_READ_SCOPE = "https://www.googleapis.com/auth/devstorage.read_only";

export type GooglePlayPromotionalRow = {
  sourceRow: number;
  date: string;
  eventIds: string;
  eventNames: string;
  country: string;
  viewersDaily: number | null;
  viewers28d: number | null;
  convertersDaily: number | null;
  converters28d: number | null;
  conversionRateDaily: string;
  conversionRate28d: string;
};

export type GooglePlayStorageObject = {
  name: string;
  size: number;
  updatedAt: string;
  generation: string;
  reportMonth: string;
};

function normalizedHeader(value: string) {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function validateGooglePlayReportBucket(input: string): string {
  const value = input.trim().replace(/\/$/, "");
  const bucket = value.startsWith("gs://") ? value.slice(5) : value;
  if (!/^pubsite_prod_rev_[a-zA-Z0-9_-]{4,80}$/.test(bucket)) {
    throw new Error("Paste the Google Play report bucket ID copied from Play Console. It starts with pubsite_prod_rev.");
  }
  return bucket;
}

function decodeGoogleCsv(input: ArrayBuffer): string {
  const bytes = new Uint8Array(input);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes.subarray(3));
  if (bytes.length > 12 && bytes.length % 2 === 0) {
    const sample = Math.min(bytes.length, 512);
    let oddZeros = 0;
    let evenZeros = 0;
    for (let index = 0; index < sample; index += 2) {
      if (bytes[index] === 0) evenZeros += 1;
      if (bytes[index + 1] === 0) oddZeros += 1;
    }
    if (oddZeros > sample / 8) return new TextDecoder("utf-16le").decode(bytes);
    if (evenZeros > sample / 8) return new TextDecoder("utf-16be").decode(bytes);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

function parseCsv(text: string): string[][] {
  const delimiters = [",", "\t", ";"];
  const delimiter = delimiters.map((candidate) => {
    let columns = 1;
    let quoted = false;
    for (let index = 0; index < Math.min(text.length, 4096); index += 1) {
      const character = text[index];
      if (character === '"') {
        if (quoted && text[index + 1] === '"') index += 1;
        else quoted = !quoted;
      } else if (!quoted && (character === "\n" || character === "\r")) break;
      else if (!quoted && character === candidate) columns += 1;
    }
    return { candidate, columns };
  }).sort((left, right) => right.columns - left.columns)[0]?.candidate ?? ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') {
      if (cell.length) throw new Error("The promotional report has an invalid quoted field.");
      quoted = true;
    } else if (character === delimiter) { row.push(cell); cell = ""; }
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else cell += character;
  }
  if (quoted) throw new Error("The promotional report contains an unfinished quoted field.");
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function findHeader(headers: string[], aliases: string[]) {
  const normalized = headers.map(normalizedHeader);
  const candidates = aliases.map(normalizedHeader);
  return normalized.findIndex((header) => candidates.includes(header));
}

function cell(row: string[], index: number) {
  return index < 0 ? "" : (row[index] ?? "").trim();
}

function parseCount(value: string, label: string, rowNumber: number): number | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—" || trimmed === "-") return null;
  const normalized = /^(?:\d{1,3}(?:,\d{3})+|\d+)$/.test(trimmed) ? trimmed.replace(/,/g, "") : trimmed;
  const count = Number(normalized);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error(`Promotional report row ${rowNumber}: ${label} must be a non-negative whole number.`);
  return count;
}

export function parseGooglePlayPromotionalReport(input: ArrayBuffer): GooglePlayPromotionalRow[] {
  const rows = parseCsv(decodeGoogleCsv(input).replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("Google Play returned a promotional report without any data rows.");
  const headers = rows[0].map((header) => header.trim());
  const indexes = {
    date: findHeader(headers, ["date", "day"]),
    eventIds: findHeader(headers, ["event id", "event ids", "promotion id"]),
    eventNames: findHeader(headers, ["event name", "event names", "promotion name"]),
    country: findHeader(headers, ["country", "country region", "country code"]),
    viewersDaily: findHeader(headers, ["total unique viewers daily", "unique viewers daily", "viewers daily"]),
    viewers28d: findHeader(headers, ["total unique viewers last 28 days", "unique viewers last 28 days", "viewers last 28 days"]),
    convertersDaily: findHeader(headers, ["total unique converters daily", "unique converters daily", "converters daily"]),
    converters28d: findHeader(headers, ["total unique converters last 28 days", "unique converters last 28 days", "converters last 28 days"]),
    conversionRateDaily: findHeader(headers, ["conversion rate daily", "conversion rate"]),
    conversionRate28d: findHeader(headers, ["conversion rate last 28 days"]),
  };
  if (indexes.date < 0 || indexes.eventNames < 0 || indexes.viewersDaily < 0 || indexes.convertersDaily < 0) {
    throw new Error("The promotional report columns did not match Google Play’s expected date, event, and daily outcome fields. No data was imported.");
  }
  if (rows.length > 10_001) throw new Error("This promotional report is unusually large. Ask Play Console for a narrower report before syncing.");

  return rows.slice(1).map((source, offset) => {
    const sourceRow = offset + 2;
    const date = cell(source, indexes.date);
    const eventNames = cell(source, indexes.eventNames);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !eventNames) throw new Error(`Promotional report row ${sourceRow}: date or event name is missing or invalid.`);
    const metrics = {
      viewersDaily: parseCount(cell(source, indexes.viewersDaily), "daily viewers", sourceRow),
      viewers28d: parseCount(cell(source, indexes.viewers28d), "28-day viewers", sourceRow),
      convertersDaily: parseCount(cell(source, indexes.convertersDaily), "daily converters", sourceRow),
      converters28d: parseCount(cell(source, indexes.converters28d), "28-day converters", sourceRow),
    };
    if (Object.values(metrics).every((value) => value === null) && !cell(source, indexes.conversionRateDaily) && !cell(source, indexes.conversionRate28d)) {
      throw new Error(`Promotional report row ${sourceRow}: no outcome metrics were provided.`);
    }
    return {
      sourceRow,
      date,
      eventIds: cell(source, indexes.eventIds).slice(0, 500),
      eventNames: eventNames.slice(0, 500),
      country: cell(source, indexes.country).slice(0, 80),
      ...metrics,
      conversionRateDaily: cell(source, indexes.conversionRateDaily).slice(0, 40),
      conversionRate28d: cell(source, indexes.conversionRate28d).slice(0, 40),
    };
  });
}

export function googlePlayReportMonth(objectName: string, updatedAt: string): string {
  const matches = [...objectName.matchAll(/(?:^|[^0-9])(20\d{2})(0[1-9]|1[0-2])(?:[^0-9]|$)/g)];
  const candidate = matches.at(-1);
  if (candidate) return `${candidate[1]}-${candidate[2]}`;
  const date = new Date(updatedAt);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 7) : "";
}

export function createPromotionalReportFingerprint(bytes: ArrayBuffer): Promise<string> {
  return crypto.subtle.digest("SHA-256", bytes).then((digest) =>
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""),
  );
}

type GoogleListResponse = {
  items?: Array<{ name?: unknown; size?: unknown; updated?: unknown; generation?: unknown }>;
  nextPageToken?: unknown;
};

export async function listGooglePlayPromotionalReports(bucketName: string, packageName: string, accessToken: string): Promise<GooglePlayStorageObject[]> {
  const objects: GooglePlayStorageObject[] = [];
  let pageToken = "";
  for (let page = 0; page < 3; page += 1) {
    const params = new URLSearchParams({ prefix: GOOGLE_PLAY_PROMOTIONAL_REPORT_PREFIX, maxResults: "1000", fields: "nextPageToken,items(name,size,updated,generation)" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o?${params.toString()}`, {
      headers: { accept: "application/json", authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error("Google Cloud Storage denied access. Invite the saved service account to Play Console and grant Global ‘View app information’ access, then check the report bucket ID.");
      if (response.status === 404) throw new Error("Google Play report bucket not found. Recopy its Cloud Storage URI from Play Console.");
      throw new Error("Google Cloud Storage could not list the promotional content reports.");
    }
    const payload = await response.json() as GoogleListResponse;
    for (const item of payload.items ?? []) {
      if (typeof item.name !== "string" || !item.name.startsWith(GOOGLE_PLAY_PROMOTIONAL_REPORT_PREFIX)) continue;
      const name = item.name;
      if (!name.toLocaleLowerCase().endsWith(".csv") || !name.includes(packageName)) continue;
      const size = typeof item.size === "string" ? Number(item.size) : typeof item.size === "number" ? item.size : NaN;
      const updatedAt = typeof item.updated === "string" ? item.updated : "";
      const reportMonth = googlePlayReportMonth(name, updatedAt);
      if (!Number.isSafeInteger(size) || size < 0 || !reportMonth) continue;
      objects.push({ name, size, updatedAt, generation: typeof item.generation === "string" ? item.generation : "", reportMonth });
    }
    pageToken = typeof payload.nextPageToken === "string" ? payload.nextPageToken : "";
    if (!pageToken) break;
  }
  return objects.sort((left, right) => right.reportMonth.localeCompare(left.reportMonth) || right.updatedAt.localeCompare(left.updatedAt)).slice(0, 6);
}

export async function downloadGooglePlayReport(bucketName: string, objectName: string, accessToken: string): Promise<ArrayBuffer> {
  if (!objectName.startsWith(GOOGLE_PLAY_PROMOTIONAL_REPORT_PREFIX) || !objectName.toLocaleLowerCase().endsWith(".csv")) {
    throw new Error("The selected report is outside the promotional content report folder.");
  }
  const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectName)}?alt=media`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("Google Cloud Storage denied access to a promotional report. Check the service account’s Play Console report permissions.");
    throw new Error("Google Cloud Storage could not download a promotional report.");
  }
  const declaredSize = Number(response.headers.get("content-length") ?? "0");
  if (declaredSize > 5 * 1024 * 1024) throw new Error("A promotional report is larger than 5 MB. Import a shorter report range from Play Console.");
  if (!response.body) throw new Error("Google Cloud Storage returned an empty report response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    byteLength += part.value.byteLength;
    if (byteLength > 5 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("A promotional report is larger than 5 MB. Import a shorter report range from Play Console.");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}
