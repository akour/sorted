import { classifyProductUrl, isPublicProductHostname, normalizeProductUrlInput, type ProductLinkKind } from "./product-url";
import { getInitialProductIconUrl } from "./product-icon-url";

type StoreLink =
  | { kind: "app-store"; id: string; url: URL }
  | { kind: "google-play"; url: URL };

export type ProductListing = {
  platform: "Google Play" | "App Store";
  title: string;
  subtitle: string;
  shortDescription: string;
  longDescription: string;
  sourceUrl: string;
  fetchedAt: string;
  category?: string;
  developer?: string;
  iconUrl?: string;
  bundleId?: string;
  storeId?: string;
};

export type ProductMetadataPreview = {
  url: string;
  sourceType: ProductLinkKind;
  sourceLabel: string;
  name: string;
  productType: "Website" | "Mobile app" | "Game";
  iconUrl: string;
  available: boolean;
  message?: string;
  currentListing?: ProductListing;
};

const iconTimeoutMs = 4_000;

function parseHttpUrl(value: string): URL | null {
  const normalized = normalizeProductUrlInput(value);
  if (!normalized) return null;
  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

function parseStoreLink(value: string): StoreLink | null {
  const url = parseHttpUrl(value);
  if (!url) return null;
  const hostname = url.hostname.toLowerCase();
  if (hostname === "apps.apple.com" || hostname === "itunes.apple.com") {
    const id = /(?:^|\/)id(\d+)(?=\/|$)/i.exec(url.pathname)?.[1];
    return id ? { kind: "app-store", id, url } : null;
  }
  if (hostname === "play.google.com" && /^\/store\/apps\/details\/?$/i.test(url.pathname) && url.searchParams.get("id")) {
    return { kind: "google-play", url };
  }
  return null;
}

export function isSafeProductIconUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.port
      && isPublicProductHostname(url.hostname);
  } catch {
    return false;
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function attribute(tag: string, name: string): string {
  const escaped = name.replace(/[.*+?^{}()$|[\]\\]/g, "\\$&");
  const match = new RegExp("(?:^|\\s)" + escaped + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i").exec(tag);
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

function metaValue(html: string, names: string[]): string {
  const expected = new Set(names.map((name) => name.toLowerCase()));
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const keys = [attribute(tag, "property"), attribute(tag, "name"), attribute(tag, "itemprop")].map((key) => key.toLowerCase());
    if (keys.some((key) => expected.has(key))) {
      const value = attribute(tag, "content");
      if (value) return value.replace(/\s+/g, " ").trim();
    }
  }
  return "";
}

function pageTitle(html: string): string {
  return decodeHtml(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim();
}

function htmlText(value: string): string {
  return decodeHtml(value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|section|article|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function jsonStringFieldValues(html: string, names: string[]): string[] {
  const keyPattern = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`(?:["'])(?:${keyPattern})(?:["'])\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "gi");
  const values: string[] = [];
  for (const match of html.matchAll(pattern)) {
    const raw = match[1] ?? "";
    try {
      const decoded = JSON.parse(`"${raw}"`) as unknown;
      if (typeof decoded === "string" && decoded.trim()) values.push(htmlText(decoded));
    } catch {
      const fallback = htmlText(raw.replace(/\\n/g, "\n").replace(/\\"/g, '"'));
      if (fallback) values.push(fallback);
    }
  }
  return values;
}

function itempropTextValues(html: string, itemprop: string): string[] {
  const escaped = itemprop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const openingPattern = new RegExp(`<([a-z][\\w:-]*)\\b(?=[^>]*\\bitemprop\\s*=\\s*["']${escaped}["'])[^>]*>`, "gi");
  const tagPattern = /<\/?([a-z][\w:-]*)(?:\s[^>]*)?>/gi;
  const values: string[] = [];
  let opening: RegExpExecArray | null;
  while ((opening = openingPattern.exec(html))) {
    const tagName = (opening[1] ?? "").toLowerCase();
    const contentStart = opening.index + opening[0].length;
    let depth = 1;
    let closingIndex = -1;
    tagPattern.lastIndex = contentStart;
    let tag: RegExpExecArray | null;
    while ((tag = tagPattern.exec(html))) {
      if ((tag[1] ?? "").toLowerCase() !== tagName) continue;
      if (tag[0].startsWith("</")) depth -= 1;
      else if (!/\/\s*>$/.test(tag[0])) depth += 1;
      if (depth === 0) {
        closingIndex = tag.index;
        break;
      }
    }
    if (closingIndex >= contentStart) {
      const value = htmlText(html.slice(contentStart, closingIndex));
      if (value) values.push(value);
    }
  }
  return values;
}

export function extractGooglePlayLongDescription(html: string, fallback: string): string {
  const candidates = [
    ...jsonStringFieldValues(html, ["description", "fullDescription", "longDescription"]),
    ...itempropTextValues(html, "description"),
  ].filter((value) => value.length > 0);
  const minimumLength = Math.max(120, fallback.length + 40);
  return candidates.filter((value) => value.length >= minimumLength).sort((a, b) => b.length - a.length)[0] ?? "";
}

function longestDescription(html: string, fallback: string): string {
  return extractGooglePlayLongDescription(html, fallback);
}

function looksLikeGame(category: string, title: string): boolean {
  return /\b(?:game|games|arcade|action|adventure|board|card|casino|casual|puzzle|racing|role[- ]?playing|simulation|sports|strategy|trivia|word)\b/i.test(`${category} ${title}`);
}

function openGraphImage(html: string, baseUrl: string): string {
  const candidate = metaValue(html, ["og:image", "og:image:secure_url", "twitter:image"]);
  if (!candidate) return "";
  try {
    const imageUrl = new URL(candidate, baseUrl);
    if (imageUrl.protocol === "https:" && !imageUrl.username && !imageUrl.password) {
      imageUrl.hash = "";
      return imageUrl.toString();
    }
  } catch {
    return "";
  }
  return "";
}

type JsonLdObject = Record<string, unknown>;

function jsonLdObjects(html: string): JsonLdObject[] {
  const objects: JsonLdObject[] = [];
  for (const script of html.match(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi) ?? []) {
    const openingTag = /^<script\b[^>]*>/i.exec(script)?.[0] ?? "";
    if (!attribute(openingTag, "type").toLowerCase().includes("ld+json")) continue;
    const content = script.replace(/^<script\b[^>]*>/i, "").replace(/<\/script\s*>$/i, "").trim();
    try {
      const parsed = JSON.parse(content) as unknown;
      const append = (value: unknown) => {
        if (Array.isArray(value)) {
          value.forEach(append);
        } else if (value && typeof value === "object") {
          const record = value as JsonLdObject;
          objects.push(record);
          if (record["@graph"]) append(record["@graph"]);
        }
      };
      append(parsed);
    } catch {
      // A malformed structured-data block should not prevent other metadata from being used.
    }
  }
  return objects;
}

function nestedName(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return nestedName(value[0]);
  if (value && typeof value === "object") {
    const record = value as JsonLdObject;
    return typeof record.name === "string" ? record.name.trim() : "";
  }
  return "";
}

function nestedImage(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return nestedImage(value[0]);
  if (value && typeof value === "object") {
    const record = value as JsonLdObject;
    return typeof record.url === "string" ? record.url.trim() : "";
  }
  return "";
}

function resolvePublicAsset(candidate: string, baseUrl: string): string {
  if (!candidate) return "";
  try {
    const url = new URL(candidate, baseUrl);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || url.port || !isPublicProductHostname(url.hostname)) return "";
    url.protocol = "https:";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function linkedFavicon(html: string, baseUrl: string): string {
  const candidates: Array<{ score: number; url: string }> = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attribute(tag, "rel").toLowerCase().split(/\s+/).filter(Boolean);
    const href = resolvePublicAsset(attribute(tag, "href"), baseUrl);
    if (!href) continue;
    if (rel.includes("apple-touch-icon")) candidates.push({ score: 30, url: href });
    else if (rel.includes("icon") || rel.includes("shortcut")) {
      const sizes = attribute(tag, "sizes").toLowerCase();
      const dimension = /^(\d+)x\d+$/.exec(sizes)?.[1];
      candidates.push({ score: dimension && Number(dimension) >= 64 ? 20 : 10, url: href });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.url ?? "";
}

type PublicHtmlPage = { html: string; url: string };

async function fetchPublicHtml(value: string, maxBytes: number): Promise<PublicHtmlPage | null> {
  return await withinTimeout(async (signal) => {
    let current: URL;
    try {
      current = new URL(value);
    } catch {
      return null;
    }

    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      if ((current.protocol !== "https:" && current.protocol !== "http:") || current.username || current.password || current.port || !isPublicProductHostname(current.hostname)) return null;
      current.protocol = "https:";
      const response = await fetch(current.toString(), {
        headers: {
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
          "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
        redirect: "manual",
        signal,
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirectCount === 3) return null;
        await response.body?.cancel().catch(() => undefined);
        try {
          current = new URL(location, current);
        } catch {
          return null;
        }
        continue;
      }

      if (!response.ok) return null;
      const contentType = response.headers.get("content-type") ?? "";
      const html = await readTextPrefix(response, maxBytes);
      if (contentType && !/(?:text\/html|application\/xhtml\+xml)/i.test(contentType) && !/<(?:!doctype\s+html|html\b|head\b)/i.test(html)) return null;
      return { html, url: current.toString() };
    }
    return null;
  });
}

function pageMetadata(html: string, baseUrl: string) {
  const structured = jsonLdObjects(html);
  const app = structured.find((item) => String(item["@type"] ?? "").toLowerCase().includes("softwareapplication"))
    ?? structured.find((item) => String(item["@type"] ?? "").toLowerCase().includes("video game"))
    ?? {};
  const website = structured.find((item) => String(item["@type"] ?? "").toLowerCase().includes("website")) ?? {};
  const title = metaValue(html, ["og:title", "twitter:title", "name"])
    || nestedName(app.name)
    || nestedName(website.name)
    || pageTitle(html);
  const siteName = metaValue(html, ["og:site_name", "application-name", "apple-mobile-web-app-title"])
    || nestedName(website.name)
    || title;
  const description = metaValue(html, ["description", "og:description", "twitter:description"])
    || (typeof app.description === "string" ? app.description.trim() : "");
  const category = metaValue(html, ["application-category", "applicationCategory", "category", "genre"])
    || nestedName(app.applicationCategory)
    || nestedName(app.genre);
  const developer = metaValue(html, ["author"])
    || nestedName(app.author)
    || nestedName(app.publisher);
  const imageUrl = resolvePublicAsset(metaValue(html, ["og:image", "og:image:secure_url", "twitter:image", "twitter:image:src", "image"]) || nestedImage(app.image), baseUrl);
  return { title, siteName, description, category, developer, imageUrl, iconUrl: linkedFavicon(html, baseUrl) };
}

async function readTextPrefix(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    const remaining = maxBytes - total;
    const chunk = value.subarray(0, remaining);
    chunks.push(chunk);
    total += chunk.byteLength;
    if (chunk.byteLength < value.byteLength || total >= maxBytes) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buffer);
}

async function withinTimeout<T>(request: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), iconTimeoutMs);
  try {
    return await request(controller.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function safeImageUrl(candidate: string | undefined): string {
  if (!candidate) return "";
  try {
    const imageUrl = new URL(candidate);
    return imageUrl.protocol === "https:" && !imageUrl.username && !imageUrl.password ? imageUrl.toString() : "";
  } catch {
    return "";
  }
}

type AppleListingResponse = {
  results?: Array<{
    artworkUrl512?: string;
    artworkUrl100?: string;
    bundleId?: string;
    description?: string;
    primaryGenreName?: string;
    sellerName?: string;
    subtitle?: string;
    trackId?: number;
    trackName?: string;
  }>;
};

async function appStoreListing(link: Extract<StoreLink, { kind: "app-store" }>) {
  const firstPathSegment = link.url.pathname.split("/").filter(Boolean)[0] ?? "";
  const storefront = /^[a-z]{2}$/i.test(firstPathSegment) ? firstPathSegment.toLowerCase() : "us";
  const countries = storefront === "us" ? ["us"] : [storefront, "us"];
  for (const country of countries) {
    const result = await withinTimeout(async (signal) => {
      const response = await fetch("https://itunes.apple.com/lookup?id=" + link.id + "&country=" + country + "&entity=software", {
        headers: { accept: "application/json", "user-agent": "Sorted/1.0 product listing reader" },
        redirect: "follow",
        signal,
      });
      if (!response.ok || (response.url && new URL(response.url).hostname !== "itunes.apple.com")) return null;
      const data = JSON.parse(await readTextPrefix(response, 512_000)) as AppleListingResponse;
      return data.results?.[0] ?? null;
    });
    if (result) return result;
  }
  return null;
}

async function googlePlayListing(link: Extract<StoreLink, { kind: "google-play" }>) {
  const requestUrl = new URL(link.url);
  if (!requestUrl.searchParams.has("hl")) requestUrl.searchParams.set("hl", "en");
  if (!requestUrl.searchParams.has("gl")) requestUrl.searchParams.set("gl", "US");
  const page = await fetchPublicHtml(requestUrl.toString(), 1_000_000);
  if (!page) {
    return { listing: null, message: "Google Play did not return a readable listing page. Check that the app is live and the link includes its app ID." };
  }

  const metadata = pageMetadata(page.html, page.url);
  const title = (metadata.title || "").replace(/\s*(?:-|–|—)\s*Apps on Google Play$/i, "").trim();
  const description = metadata.description.trim();
  const fullDescription = longestDescription(page.html, description);
  const category = metadata.category.trim() || jsonStringFieldValues(page.html, ["genre", "applicationCategory", "category"])[0] || "";
  const developer = metadata.developer.trim() || jsonStringFieldValues(page.html, ["author", "publisher", "developer"])[0] || "";
  const discoveredIcon = metadata.imageUrl || openGraphImage(page.html, page.url);
  const iconUrl = isSafeProductIconUrl(discoveredIcon) ? discoveredIcon : "";
  if (!title && !description && !iconUrl) {
    return { listing: null, message: "Google Play opened the link but did not provide app details. You can add the product manually and retry later." };
  }
  return { listing: { title, description, fullDescription, category, developer, iconUrl }, message: "" };
}

export async function fetchProductMetadata(value: string): Promise<ProductMetadataPreview | null> {
  const normalizedUrl = normalizeProductUrlInput(value);
  const sourceType = classifyProductUrl(normalizedUrl);
  if (!normalizedUrl || !sourceType) return null;

  if (sourceType === "website") {
    const page = await fetchPublicHtml(normalizedUrl, 768_000);
    if (!page) {
      return {
        url: normalizedUrl,
        sourceType,
        sourceLabel: "Website",
        name: "",
        productType: "Website",
        iconUrl: getInitialProductIconUrl(normalizedUrl),
        available: false,
        message: "Sorted could not read a live page at this address. Check the URL or add the product manually.",
      };
    }
    const metadata = pageMetadata(page.html, page.url);
    // Only use a favicon URL advertised by the live page. Assuming /favicon.ico
    // exists stores a broken image for sites that use a different path.
    const iconUrl = metadata.iconUrl || getInitialProductIconUrl(page.url);
    const hasPageIdentity = Boolean(metadata.siteName || metadata.title || metadata.iconUrl);
    return {
      url: normalizedUrl,
      sourceType,
      sourceLabel: "Website",
      name: metadata.siteName || metadata.title,
      productType: "Website",
      iconUrl: isSafeProductIconUrl(iconUrl) ? iconUrl : getInitialProductIconUrl(page.url),
      available: true,
      message: hasPageIdentity
        ? "Live website details found. Review its name and icon before adding."
        : "The website responded, but it did not expose a name or favicon. You can enter the product name manually.",
    };
  }

  const link = parseStoreLink(normalizedUrl);
  if (!link) {
    return {
      url: normalizedUrl,
      sourceType,
      sourceLabel: sourceType === "app-store" ? "App Store" : "Google Play",
      name: "",
      productType: "Mobile app",
      iconUrl: "",
      available: false,
      message: sourceType === "app-store"
        ? "Use an App Store link that includes the app’s numeric ID (id followed by digits)."
        : "Use a Google Play app-details link that includes the app ID after id=.",
    };
  }

  if (link.kind === "app-store") {
    const result = await appStoreListing(link);
    if (!result) return {
      url: normalizedUrl,
      sourceType,
      sourceLabel: "App Store",
      name: "",
      productType: "Mobile app",
      iconUrl: "",
      available: false,
      message: "Apple’s lookup did not return this app in the linked storefront. Check the country code or add its name manually.",
    };
    const title = (result.trackName ?? "").trim();
    const category = (result.primaryGenreName ?? "").trim();
    const developer = (result.sellerName ?? "").trim();
    const description = (result.description ?? "").trim();
    const subtitle = (result.subtitle ?? "").trim();
    const artwork = safeImageUrl(result.artworkUrl512) || safeImageUrl(result.artworkUrl100);
    const iconUrl = isSafeProductIconUrl(artwork) ? artwork : "";
    const currentListing: ProductListing = {
      platform: "App Store",
      title,
      subtitle,
      shortDescription: subtitle,
      longDescription: description,
      sourceUrl: normalizedUrl,
      fetchedAt: new Date().toISOString(),
      ...(category ? { category } : {}),
      ...(developer ? { developer } : {}),
      ...(iconUrl ? { iconUrl } : {}),
      ...(result.bundleId ? { bundleId: result.bundleId } : {}),
      ...(result.trackId ? { storeId: String(result.trackId) } : {}),
    };
    return {
      url: normalizedUrl,
      sourceType,
      sourceLabel: "App Store",
      name: title,
      productType: category.toLowerCase() === "games" ? "Game" : "Mobile app",
      iconUrl,
      available: Boolean(title || iconUrl || description),
      message: "App Store details found. Review the suggested name and type before adding.",
      currentListing,
    };
  }

  const { listing: result, message } = await googlePlayListing(link);
  if (!result) return {
    url: normalizedUrl,
    sourceType,
    sourceLabel: "Google Play",
    name: "",
    productType: "Mobile app",
    iconUrl: "",
    available: false,
    message,
  };
  const title = result.title.trim();
  const description = result.description.trim();
  const category = result.category.trim();
  const developer = result.developer.trim();
  const currentListing: ProductListing = {
    platform: "Google Play",
    title,
    subtitle: "",
    shortDescription: description,
    longDescription: result.fullDescription.trim(),
    sourceUrl: normalizedUrl,
    fetchedAt: new Date().toISOString(),
    ...(category ? { category } : {}),
    ...(developer ? { developer } : {}),
    ...(result.iconUrl ? { iconUrl: result.iconUrl } : {}),
  };
  return {
    url: normalizedUrl,
    sourceType,
    sourceLabel: "Google Play",
    name: title,
    productType: looksLikeGame(category, title) ? "Game" : "Mobile app",
    iconUrl: result.iconUrl,
    available: Boolean(title || result.iconUrl || description),
    message: "Google Play details found. Review the suggested name and type before adding.",
    currentListing,
  };
}

export async function fetchProductIcon(value: string): Promise<string> {
  const preview = await fetchProductMetadata(value);
  return preview?.iconUrl ?? "";
}
