const GOOGLE_SEARCH_CONSOLE_API_ROOT = "https://www.googleapis.com/webmasters/v3";

export type SearchConsoleSite = { siteUrl: string; permissionLevel: string };
export type SearchConsoleRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

async function request<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GOOGLE_SEARCH_CONSOLE_API_ROOT}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
      authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = await response.json().catch(() => ({})) as { error?: { message?: unknown }; siteEntry?: unknown };
  if (!response.ok) {
    const detail = typeof payload.error?.message === "string" ? payload.error.message.trim().slice(0, 240) : "Google Search Console rejected the request.";
    if (response.status === 401 || response.status === 403) throw new Error("Google denied Search Console access. Confirm this account can view the property and that Search Console API is enabled in Google Cloud.");
    throw new Error(detail || "Google Search Console could not complete the request.");
  }
  return payload as T;
}

export async function listSearchConsoleSites(accessToken: string): Promise<SearchConsoleSite[]> {
  const payload = await request<{ siteEntry?: unknown }>("/sites", accessToken);
  if (!Array.isArray(payload.siteEntry)) return [];
  return payload.siteEntry.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const site = item as Record<string, unknown>;
    if (typeof site.siteUrl !== "string" || typeof site.permissionLevel !== "string") return [];
    return [{ siteUrl: site.siteUrl, permissionLevel: site.permissionLevel }];
  });
}

export async function querySearchConsole(input: { accessToken: string; siteUrl: string; startDate: string; endDate: string; dimensions: string[] }): Promise<SearchConsoleRow[]> {
  const path = `/sites/${encodeURIComponent(input.siteUrl)}/searchAnalytics/query`;
  const payload = await request<{ rows?: unknown }>(path, input.accessToken, {
    method: "POST",
    body: JSON.stringify({ startDate: input.startDate, endDate: input.endDate, dimensions: input.dimensions, rowLimit: 50, dataState: "all" }),
  });
  if (!Array.isArray(payload.rows)) return [];
  return payload.rows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const keys = Array.isArray(row.keys) ? row.keys.filter((key): key is string => typeof key === "string") : [];
    const clicks = Number(row.clicks ?? 0);
    const impressions = Number(row.impressions ?? 0);
    const ctr = Number(row.ctr ?? 0);
    const position = Number(row.position ?? 0);
    if (![clicks, impressions, ctr, position].every(Number.isFinite)) return [];
    return [{ keys, clicks, impressions, ctr, position }];
  });
}
