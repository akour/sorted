import type { ProductListing } from "./product-icons";
import { validateGooglePlayListingText, type GooglePlayListingText } from "./google-play-localizations";

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_PLAY_API_ROOT = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const GOOGLE_PLAY_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

export type GooglePlayCredentials = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

export type GooglePlayListing = {
  language: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
  video?: string;
};

export type GooglePlayConnectionCheck = {
  ok: true;
  reviewCount: number;
};

class GooglePlayApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "GooglePlayApiError";
  }
}

function base64UrlEncode(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, "\n").trim();
}

export function parseGooglePlayCredentials(value: unknown): GooglePlayCredentials {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("Paste the complete Google service-account JSON key.");
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Paste the complete Google service-account JSON key.");
  }
  const candidate = parsed as Record<string, unknown>;
  const clientEmail = typeof candidate.client_email === "string" ? candidate.client_email.trim() : "";
  const privateKey = typeof candidate.private_key === "string" ? normalizePrivateKey(candidate.private_key) : "";
  if (!clientEmail || !clientEmail.includes("@") || !privateKey.includes("BEGIN PRIVATE KEY") || !privateKey.includes("END PRIVATE KEY")) {
    throw new Error("That key is missing the service account email or private key.");
  }
  return {
    client_email: clientEmail,
    private_key: privateKey,
    project_id: typeof candidate.project_id === "string" ? candidate.project_id.trim() : undefined,
  };
}

export function validateGooglePlayPackageName(value: string): string {
  const packageName = value.trim();
  if (!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/.test(packageName) || packageName.length > 255) {
    throw new Error("Enter the Android package name exactly as it appears in Google Play Console.");
  }
  return packageName;
}

export function validateGooglePlayLocale(value: string): string {
  const locale = value.trim() || "en-US";
  if (!/^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})?$/.test(locale) || locale.length > 20) {
    throw new Error("Enter a valid Google Play language code, such as en-US.");
  }
  return locale.replace("_", "-");
}

async function importPrivateKey(credentials: GooglePlayCredentials): Promise<CryptoKey> {
  const pemBody = normalizePrivateKey(credentials.private_key)
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  if (!pemBody) throw new Error("The Google service-account private key is empty.");
  let der: Uint8Array;
  try {
    der = decodeBase64(pemBody);
  } catch {
    throw new Error("The Google service-account private key is not valid.");
  }
  try {
    return await crypto.subtle.importKey("pkcs8", der as unknown as BufferSource, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  } catch {
    throw new Error("The Google service-account private key could not be read.");
  }
}

export async function getGooglePlayAccessToken(credentials: GooglePlayCredentials, scope = GOOGLE_PLAY_SCOPE): Promise<string> {
  const key = await importPrivateKey(credentials);
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(JSON.stringify({
    iss: credentials.client_email,
    scope,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const unsignedToken = `${header}.${payload}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsignedToken));
  const assertion = `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`;
  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    throw new GooglePlayApiError(response.status, "Google rejected the service-account credentials. Check the key and Play Console access.");
  }
  const data = await response.json() as { access_token?: unknown };
  if (typeof data.access_token !== "string" || !data.access_token) throw new Error("Google did not return an access token.");
  return data.access_token;
}

async function googlePlayRequest(path: string, accessToken: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${GOOGLE_PLAY_API_ROOT}${path}`, {
    ...init,
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}), authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    let message = "Google Play could not complete that request.";
    try {
      const body = await response.json() as { error?: { message?: unknown } };
      if (typeof body.error?.message === "string" && body.error.message.trim()) message = body.error.message.trim();
    } catch {
      // Keep the response generic when Google does not return JSON.
    }
    if (response.status === 401 || response.status === 403) {
      message = "Google Play denied access. Confirm that this service account is invited to the app in Play Console.";
    }
    throw new GooglePlayApiError(response.status, message);
  }
  return response.json();
}

export async function testGooglePlayConnection(credentials: GooglePlayCredentials, packageNameInput: string): Promise<GooglePlayConnectionCheck> {
  const packageName = validateGooglePlayPackageName(packageNameInput);
  const accessToken = await getGooglePlayAccessToken(credentials);
  const data = await googlePlayRequest(`/applications/${encodeURIComponent(packageName)}/reviews?maxResults=1`, accessToken) as { reviews?: unknown[] };
  return { ok: true, reviewCount: Array.isArray(data.reviews) ? data.reviews.length : 0 };
}

export async function fetchGooglePlayListing(credentials: GooglePlayCredentials, packageNameInput: string, localeInput: string): Promise<GooglePlayListing> {
  const packageName = validateGooglePlayPackageName(packageNameInput);
  const locale = validateGooglePlayLocale(localeInput);
  const accessToken = await getGooglePlayAccessToken(credentials);
  const edit = await googlePlayRequest(`/applications/${encodeURIComponent(packageName)}/edits`, accessToken, { method: "POST", body: "{}" }) as { id?: unknown };
  const editId = typeof edit.id === "string" ? edit.id : "";
  if (!editId) throw new Error("Google Play did not create a temporary listing read session.");
  try {
    const data = await googlePlayRequest(`/applications/${encodeURIComponent(packageName)}/edits/${encodeURIComponent(editId)}/listings`, accessToken) as { listings?: unknown[] };
    const listings = Array.isArray(data.listings) ? data.listings as Array<Record<string, unknown>> : [];
    const listing = listings.find((item) => item.language === locale) ?? listings.find((item) => item.language === "en-US") ?? listings[0];
    if (!listing) throw new Error("Google Play returned no localized listing for this app.");
    const title = typeof listing.title === "string" ? listing.title.trim() : "";
    const shortDescription = typeof listing.shortDescription === "string" ? listing.shortDescription.trim() : "";
    const fullDescription = typeof listing.fullDescription === "string" ? listing.fullDescription.trim() : "";
    if (!title && !shortDescription && !fullDescription) throw new Error("Google Play returned an empty listing.");
    return {
      language: typeof listing.language === "string" ? listing.language : locale,
      title,
      shortDescription,
      fullDescription,
      video: typeof listing.video === "string" ? listing.video : undefined,
    };
  } finally {
    await fetch(`${GOOGLE_PLAY_API_ROOT}/applications/${encodeURIComponent(packageName)}/edits/${encodeURIComponent(editId)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken}` },
    }).catch(() => undefined);
  }
}

export async function publishGooglePlayListingsWithAccessToken(
  accessToken: string,
  packageNameInput: string,
  listings: Array<GooglePlayListingText & { language: string }>,
): Promise<{ publishedLocales: string[] }> {
  const packageName = validateGooglePlayPackageName(packageNameInput);
  if (!accessToken.trim()) throw new Error("Reconnect Google Play before publishing.");
  if (!listings.length) throw new Error("Select at least one complete locale to publish.");
  const seen = new Set<string>();
  for (const listing of listings) {
    const language = validateGooglePlayLocale(listing.language);
    if (seen.has(language)) throw new Error(`The ${language} listing was selected more than once.`);
    seen.add(language);
    const errors = validateGooglePlayListingText(listing);
    if (errors.length) throw new Error(`${language}: ${errors.join(" ")}`);
  }

  const edit = await googlePlayRequest(`/applications/${encodeURIComponent(packageName)}/edits`, accessToken, { method: "POST", body: "{}" }) as { id?: unknown };
  const editId = typeof edit.id === "string" ? edit.id : "";
  if (!editId) throw new Error("Google Play did not create an edit for these listing changes.");
  let committed = false;
  try {
    for (const listing of listings) {
      const language = validateGooglePlayLocale(listing.language);
      await googlePlayRequest(
        `/applications/${encodeURIComponent(packageName)}/edits/${encodeURIComponent(editId)}/listings/${encodeURIComponent(language)}`,
        accessToken,
        { method: "PUT", body: JSON.stringify({ title: listing.title, shortDescription: listing.shortDescription, fullDescription: listing.fullDescription }) },
      );
    }
    await googlePlayRequest(`/applications/${encodeURIComponent(packageName)}/edits/${encodeURIComponent(editId)}:validate`, accessToken, { method: "POST", body: "{}" });
    await googlePlayRequest(`/applications/${encodeURIComponent(packageName)}/edits/${encodeURIComponent(editId)}:commit`, accessToken, { method: "POST", body: "{}" });
    committed = true;
    return { publishedLocales: listings.map((item) => item.language) };
  } finally {
    if (!committed) {
      await fetch(`${GOOGLE_PLAY_API_ROOT}/applications/${encodeURIComponent(packageName)}/edits/${encodeURIComponent(editId)}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${accessToken}` },
      }).catch(() => undefined);
    }
  }
}

export function mergeGooglePlayListing(authenticated: GooglePlayListing, sourceUrl: string, fallback?: ProductListing): ProductListing {
  return {
    platform: "Google Play",
    title: authenticated.title || fallback?.title || "",
    subtitle: fallback?.subtitle || "",
    shortDescription: authenticated.shortDescription || fallback?.shortDescription || "",
    longDescription: authenticated.fullDescription || fallback?.longDescription || "",
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    category: fallback?.category,
    developer: fallback?.developer,
    iconUrl: fallback?.iconUrl,
    bundleId: fallback?.bundleId,
    storeId: fallback?.storeId,
  };
}

export function googlePlayErrorMessage(error: unknown): string {
  if (error instanceof GooglePlayApiError) return error.message;
  return error instanceof Error ? error.message : "Google Play could not complete that request.";
}
