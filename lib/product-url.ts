export type ProductLinkKind = "website" | "google-play" | "app-store";

const explicitUrl = /(?:https?:\/\/|www\.)[^\s<>"'`]+/i;
const bareDomain = /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?(?:\/[^\s<>"'`]*)?/i;

export function normalizeProductUrlInput(value: string): string {
  const raw = value.trim();
  if (!raw) return "";

  // Product rows include a type label before the URL. Extract the actual link
  // when users copy and paste the whole row into the product form.
  const candidate = (explicitUrl.exec(raw)?.[0] ?? bareDomain.exec(raw)?.[0] ?? raw)
    .replace(/[.,;!?)}\]]+$/, "");
  const withScheme = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;

  try {
    const url = new URL(withScheme);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || url.port) return "";
    if (!isPublicProductHostname(url.hostname)) return "";
    url.protocol = "https:";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

export function isPublicProductHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized.includes(".")
    && !normalized.startsWith("[")
    && !normalized.includes(":")
    && !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(normalized)
    && normalized !== "localhost"
    && !normalized.endsWith(".localhost")
    && !normalized.endsWith(".local")
    && !normalized.endsWith(".internal")
    && !normalized.endsWith(".test");
}

export function classifyProductUrl(value: string): ProductLinkKind | null {
  const normalized = normalizeProductUrlInput(value);
  if (!normalized) return null;
  const hostname = new URL(normalized).hostname.toLowerCase();
  if (hostname === "apps.apple.com" || hostname === "itunes.apple.com") return "app-store";
  if (hostname === "play.google.com") return "google-play";
  return "website";
}
