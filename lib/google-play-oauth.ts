import type { ProductListing } from "./product-icons";

const GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_OAUTH_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_PLAY_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const GOOGLE_PLAY_API_ROOT = "https://androidpublisher.googleapis.com/androidpublisher/v3";

export type GooglePlayOAuthTokens = {
  refreshToken: string;
  accountEmail: string;
};

export function createGooglePlayOAuthState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function hashGooglePlayOAuthState(state: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state));
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function buildGooglePlayAuthorizationUrl(input: { clientId: string; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: `openid email ${GOOGLE_PLAY_SCOPE}`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: input.state,
  });
  return `${GOOGLE_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

async function tokenRequest(body: URLSearchParams): Promise<Record<string, unknown>> {
  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const detail = typeof payload.error_description === "string" ? payload.error_description : "Google rejected the OAuth request.";
    throw new Error(detail.slice(0, 240));
  }
  return payload;
}

export async function exchangeGooglePlayAuthorizationCode(input: { code: string; clientId: string; clientSecret: string; redirectUri: string; }): Promise<GooglePlayOAuthTokens> {
  const payload = await tokenRequest(new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
  }));
  const refreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token.trim() : "";
  const accessToken = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  if (!refreshToken || !accessToken) throw new Error("Google did not return a refresh token. Try connecting again and approve offline access.");
  return { refreshToken, accountEmail: await fetchGoogleAccountEmail(accessToken) };
}

export async function refreshGooglePlayAccessToken(input: { clientId: string; clientSecret: string; refreshToken: string; }): Promise<string> {
  const payload = await tokenRequest(new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
    grant_type: "refresh_token",
  }));
  const accessToken = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  if (!accessToken) throw new Error("Google did not return an access token. Reconnect the Google Play account.");
  return accessToken;
}

async function fetchGoogleAccountEmail(accessToken: string): Promise<string> {
  try {
    const response = await fetch(GOOGLE_OAUTH_USERINFO_URL, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!response.ok) return "";
    const payload = await response.json() as { email?: unknown };
    return typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  } catch {
    return "";
  }
}

async function googlePlayRequest(path: string, accessToken: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${GOOGLE_PLAY_API_ROOT}${path}`, {
    ...init,
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}), authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    let message = "Google Play could not complete that request.";
    try {
      const payload = await response.json() as { error?: { message?: unknown } };
      if (typeof payload.error?.message === "string" && payload.error.message.trim()) message = payload.error.message.trim();
    } catch {
      // Keep the response generic when Google does not return JSON.
    }
    if (response.status === 401 || response.status === 403) message = "Google Play denied access. Confirm that this Google account has access to the app in Play Console.";
    throw new Error(message);
  }
  return response.json();
}

export async function fetchGooglePlayListingWithAccessToken(accessToken: string, packageNameInput: string, localeInput: string): Promise<ProductListing & { language: string }> {
  const packageName = packageNameInput.trim();
  const locale = localeInput.trim() || "en-US";
  const edit = await googlePlayRequest(`/applications/${encodeURIComponent(packageName)}/edits`, accessToken, { method: "POST", body: "{}" }) as { id?: unknown };
  const editId = typeof edit.id === "string" ? edit.id : "";
  if (!editId) throw new Error("Google Play did not create a temporary listing read session.");
  try {
    const data = await googlePlayRequest(`/applications/${encodeURIComponent(packageName)}/edits/${encodeURIComponent(editId)}/listings`, accessToken) as { listings?: unknown[] };
    const listings = Array.isArray(data.listings) ? data.listings as Array<Record<string, unknown>> : [];
    const normalizedLocale = locale.replace(/_/g, "-").toLowerCase();
    const listing = listings.find((item) => typeof item.language === "string" && item.language.replace(/_/g, "-").toLowerCase() === normalizedLocale);
    if (!listing) throw new Error(`Google Play has no listing for the connected locale (${locale}). Choose a locale that exists in Play Console.`);
    return {
      platform: "Google Play",
      language: typeof listing.language === "string" ? listing.language : locale,
      title: typeof listing.title === "string" ? listing.title : "",
      subtitle: "",
      shortDescription: typeof listing.shortDescription === "string" ? listing.shortDescription : "",
      longDescription: typeof listing.fullDescription === "string" ? listing.fullDescription : "",
      sourceUrl: `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}`,
      fetchedAt: new Date().toISOString(),
      fetchSource: "google-play-api",
    };
  } finally {
    await fetch(`${GOOGLE_PLAY_API_ROOT}/applications/${encodeURIComponent(packageName)}/edits/${encodeURIComponent(editId)}`, { method: "DELETE", headers: { authorization: `Bearer ${accessToken}` } }).catch(() => undefined);
  }
}

export async function revokeGooglePlayRefreshToken(refreshToken: string): Promise<void> {
  await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: refreshToken }) }).catch(() => undefined);
}

export function googlePlayOAuthErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 240) : "Google Play authorization could not be completed.";
}
