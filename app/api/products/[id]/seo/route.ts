import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { products, websiteSeoAudits } from "@/db/schema";
import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";
import { classifyProductUrl } from "@/lib/product-url";

type Check = { id: string; label: string; passed: boolean; evidence: string; recommendation: string };
type Audit = { url: string; checkedAt: string; status: number; title: string; description: string; canonical: string; h1Count: number; language: string; checks: Check[] };
const checkIds = ["http", "title", "description", "canonical", "h1", "indexing", "language"];

function decodeHtml(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (entity, code: string) => {
    const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
    if (code[0] !== "#") return named[code.toLowerCase()] ?? entity;
    const number = code[1]?.toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
    try { return Number.isFinite(number) && number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity; } catch { return entity; }
  });
}

function attributes(tag: string) {
  const result: Record<string, string> = {};
  const body = tag.replace(/^<[\w:-]+|\/?\s*>$/g, "");
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of body.matchAll(pattern)) result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  return result;
}

function firstTag(html: string, name: string) {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "i"))?.[0] ?? "";
}

function metaContent(html: string, name: string) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if (attrs.name?.toLowerCase() === name.toLowerCase()) return decodeHtml(attrs.content ?? "").replace(/\s+/g, " ").trim();
  }
  return "";
}

function decodedTagText(html: string, name: string) {
  const match = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}\\s*>`, "i").exec(html);
  return decodeHtml((match?.[1] ?? "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function privateLiteral(host: string) {
  const value = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (value === "localhost" || value.endsWith(".localhost") || value.endsWith(".local") || value.endsWith(".internal") || value === "metadata.google.internal") return true;
  if (value.includes(":")) return true;
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || parts[0] >= 224 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && (parts[1] === 0 || parts[1] === 168)) || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19 || parts[1] === 51)) || (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
}

function checkSet(url: string, status: number, html: string): Audit {
  const title = decodedTagText(html, "title");
  const description = metaContent(html, "description");
  const canonicalTag = html.match(/<link\b[^>]*>/gi)?.find((tag) => (attributes(tag).rel ?? "").toLowerCase().split(/\s+/).includes("canonical")) ?? "";
  const canonical = decodeHtml(attributes(canonicalTag).href ?? "").trim();
  const h1Count = [...html.matchAll(/<h1\b/gi)].length;
  const language = decodeHtml(attributes(firstTag(html, "html")).lang ?? "").trim();
  const noindex = /(?:^|[,\s])noindex(?:$|[,\s])/i.test(metaContent(html, "robots"));
  const safeCanonical = (() => { try { return canonical ? new URL(canonical, url).toString() : ""; } catch { return canonical; } })();
  const canonicalSameHost = (() => { try { return Boolean(safeCanonical) && new URL(safeCanonical).hostname === new URL(url).hostname; } catch { return false; } })();
  const checks: Check[] = [
    { id: "http", label: "Public page responds", passed: status >= 200 && status < 300, evidence: `HTTP ${status}`, recommendation: "Make the page available publicly and return a successful response." },
    { id: "title", label: "Descriptive page title", passed: title.length >= 15 && title.length <= 70, evidence: title ? `“${title}” (${title.length} characters)` : "No page title found", recommendation: "Add a unique title that says what this page offers and identifies the product or service." },
    { id: "description", label: "Search description", passed: description.length >= 50 && description.length <= 180, evidence: description ? `${description.length} characters` : "No meta description found", recommendation: "Write a concise, accurate summary of this page for people deciding whether to visit." },
    { id: "canonical", label: "Canonical URL", passed: canonicalSameHost, evidence: safeCanonical || "No canonical link found", recommendation: "Set one canonical URL on the page and use the same URL in internal links and the sitemap." },
    { id: "h1", label: "Main page heading", passed: h1Count === 1, evidence: `${h1Count} H1 heading${h1Count === 1 ? "" : "s"} found`, recommendation: "Use one clear visible H1 heading that describes the main page topic." },
    { id: "indexing", label: "Indexing is not blocked by page robots tag", passed: !noindex, evidence: noindex ? "A robots meta tag contains noindex" : "No noindex robots meta tag found", recommendation: "Remove noindex only if this page is intended to appear in search." },
    { id: "language", label: "Page language is declared", passed: Boolean(language), evidence: language || "No html lang attribute found", recommendation: "Set the html lang attribute to the page's primary language, such as en or ar." },
  ];
  return { url, checkedAt: new Date().toISOString(), status, title, description, canonical: safeCanonical, h1Count, language, checks };
}

class InspectionError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function fetchPage(target: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(target.toString(), { headers: { accept: "text/html,application/xhtml+xml;q=0.9" }, redirect: "manual", signal: controller.signal });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      let redirected: URL | null = null;
      try { redirected = location ? new URL(location, target) : null; } catch { /* invalid redirect */ }
      if (!redirected || redirected.protocol !== "https:" || redirected.hostname !== target.hostname) throw new InspectionError("This site redirects to a different host. Open its final public HTTPS page and save that URL as the website destination.", 422);
      throw new InspectionError("This site redirects. Update the saved website URL to its final canonical address, then inspect again.", 422);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new InspectionError("The website address did not return an HTML page.", 422);
    const length = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(length) && length > 1_000_000) throw new InspectionError("The page is too large to inspect safely (maximum 1 MB).", 413);
    const reader = response.body?.getReader();
    if (!reader) throw new InspectionError("The website returned an empty page.", 422);
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 1_000_000) {
        await reader.cancel();
        throw new InspectionError("The page is too large to inspect safely (maximum 1 MB).", 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { response, html: new TextDecoder().decode(bytes) };
  } finally { clearTimeout(timeout); }
}

function parse<T>(value: string | undefined, fallback: T): T {
  try { return JSON.parse(value ?? "") as T; } catch { return fallback; }
}

async function getOwnedProduct(id: number, ownerId: string) {
  const [product] = await getDb().select().from(products).where(and(eq(products.id, id), eq(products.ownerId, ownerId))).limit(1);
  return product;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || !(await getOwnedProduct(id, ownerId))) return Response.json({ error: "Product not found." }, { status: 404 });
    const [record] = await getDb().select().from(websiteSeoAudits).where(and(eq(websiteSeoAudits.productId, id), eq(websiteSeoAudits.ownerId, ownerId))).limit(1);
    return Response.json({ audit: parse(record?.audit, null), actionStates: parse(record?.actionStates, {}), metrics: parse(record?.metrics, []) });
  } catch { return Response.json({ error: "Could not load the website SEO review." }, { status: 500 }); }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const id = Number((await context.params).id);
    const product = Number.isSafeInteger(id) ? await getOwnedProduct(id, ownerId) : null;
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
    const destination = product.websiteUrl || (classifyProductUrl(product.url) === "website" ? product.url : "");
    let target: URL;
    try { target = new URL(destination); } catch { return Response.json({ error: "Add a public website URL to this product before inspecting it." }, { status: 400 }); }
    if (target.protocol !== "https:" || target.username || target.password || privateLiteral(target.hostname) || !target.hostname.includes(".")) return Response.json({ error: "Inspection only supports public HTTPS websites." }, { status: 400 });
    let fetched: { response: Response; html: string };
    try { fetched = await fetchPage(target); }
    catch (error) { if (error instanceof InspectionError) return Response.json({ error: error.message }, { status: error.status }); throw error; }
    const audit = checkSet(target.toString(), fetched.response.status, fetched.html);
    const db = getDb();
    const [existing] = await db.select().from(websiteSeoAudits).where(and(eq(websiteSeoAudits.productId, id), eq(websiteSeoAudits.ownerId, ownerId))).limit(1);
    const oldStates = parse<Record<string, string>>(existing?.actionStates, {});
    for (const check of audit.checks) if (check.passed && oldStates[check.id] === "done") oldStates[check.id] = "verified";
    const now = new Date().toISOString();
    const [record] = existing
      ? await db.update(websiteSeoAudits).set({ audit: JSON.stringify(audit), actionStates: JSON.stringify(oldStates), updatedAt: now }).where(eq(websiteSeoAudits.id, existing.id)).returning()
      : await db.insert(websiteSeoAudits).values({ productId: id, ownerId, audit: JSON.stringify(audit), actionStates: JSON.stringify(oldStates), updatedAt: now }).returning();
    return Response.json({ audit, actionStates: parse(record?.actionStates, {}) });
  } catch (error) {
    return Response.json({ error: error instanceof Error && error.name === "AbortError" ? "The site took too long to respond. Try again." : "Could not inspect this website right now." }, { status: 502 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || !(await getOwnedProduct(id, ownerId))) return Response.json({ error: "Product not found." }, { status: 404 });
    const payload = await request.json() as { checkId?: string; state?: string; metrics?: unknown };
    const db = getDb();
    const [existing] = await db.select().from(websiteSeoAudits).where(and(eq(websiteSeoAudits.productId, id), eq(websiteSeoAudits.ownerId, ownerId))).limit(1);
    if (!existing) return Response.json({ error: "Inspect the website before saving actions." }, { status: 409 });
    const actionStates = parse<Record<string, string>>(existing.actionStates, {});
    if (payload.checkId && checkIds.includes(payload.checkId) && ["done", "open"].includes(payload.state ?? "")) actionStates[payload.checkId] = payload.state!;
    const metrics = Array.isArray(payload.metrics) ? payload.metrics.slice(-24).filter((item) => typeof item === "object" && item !== null).map((item) => ({ date: String((item as Record<string, unknown>).date ?? "").slice(0, 10), clicks: Number((item as Record<string, unknown>).clicks), impressions: Number((item as Record<string, unknown>).impressions), notes: String((item as Record<string, unknown>).notes ?? "").slice(0, 500) })).filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(item.clicks) && item.clicks >= 0 && Number.isFinite(item.impressions) && item.impressions >= 0) : parse(existing.metrics, []);
    const [record] = await db.update(websiteSeoAudits).set({ actionStates: JSON.stringify(actionStates), metrics: JSON.stringify(metrics), updatedAt: new Date().toISOString() }).where(eq(websiteSeoAudits.id, existing.id)).returning();
    return Response.json({ actionStates: parse(record.actionStates, {}), metrics: parse(record.metrics, []) });
  } catch { return Response.json({ error: "Could not save the website SEO update." }, { status: 500 }); }
}
