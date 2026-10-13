import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adminOAuthClients, googleSearchConsoleConnections, products, websiteSeoAudits } from "@/db/schema";
import { getGoogleSearchConsoleAccess } from "@/lib/google-search-console-auth";
import { listSearchConsoleSites, querySearchConsole, type SearchConsoleRow, type SearchConsoleSite } from "@/lib/google-search-console";
import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";
import { classifyProductUrl } from "@/lib/product-url";

type Snapshot = {
  startDate: string;
  endDate: string;
  fetchedAt: string;
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  daily: SearchConsoleRow[];
  queries: SearchConsoleRow[];
  pages: SearchConsoleRow[];
};

function parse<T>(value: string | undefined, fallback: T): T {
  try { return JSON.parse(value ?? "") as T; } catch { return fallback; }
}

async function getOwnedWebsiteProduct(id: number, ownerId: string) {
  const [product] = await getDb().select().from(products).where(and(eq(products.id, id), eq(products.ownerId, ownerId))).limit(1);
  if (!product) return { product: null, websiteUrl: "" };
  const websiteUrl = product.websiteUrl || (classifyProductUrl(product.url) === "website" ? product.url : "");
  return { product, websiteUrl };
}

function propertyHost(siteUrl: string): { host: string; domainProperty: boolean } | null {
  if (siteUrl.startsWith("sc-domain:")) {
    const host = siteUrl.slice("sc-domain:".length).trim().toLowerCase().replace(/\.$/, "");
    return host && !host.includes("/") ? { host, domainProperty: true } : null;
  }
  try {
    const url = new URL(siteUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? { host: url.hostname.toLowerCase(), domainProperty: false } : null;
  } catch { return null; }
}

function siteMatchesWebsite(siteUrl: string, websiteUrl: string) {
  const site = propertyHost(siteUrl);
  try {
    const host = new URL(websiteUrl).hostname.toLowerCase();
    return Boolean(site && (site.domainProperty ? host === site.host || host.endsWith(`.${site.host}`) : host === site.host));
  } catch { return false; }
}

async function getProductSeoRecord(productId: number, ownerId: string) {
  const [record] = await getDb().select().from(websiteSeoAudits).where(and(eq(websiteSeoAudits.productId, productId), eq(websiteSeoAudits.ownerId, ownerId))).limit(1);
  return record;
}

async function saveSearchConsoleSettings(input: { productId: number; ownerId: string; property?: string; snapshot?: Snapshot }) {
  const db = getDb();
  const existing = await getProductSeoRecord(input.productId, input.ownerId);
  const now = new Date().toISOString();
  if (existing) {
    const values: { searchConsoleProperty?: string; searchConsoleSnapshot?: string; updatedAt: string } = { updatedAt: now };
    if (input.property !== undefined) values.searchConsoleProperty = input.property;
    if (input.snapshot !== undefined) values.searchConsoleSnapshot = JSON.stringify(input.snapshot);
    const [saved] = await db.update(websiteSeoAudits).set(values).where(eq(websiteSeoAudits.id, existing.id)).returning();
    return saved;
  }
  const [saved] = await db.insert(websiteSeoAudits).values({
    productId: input.productId,
    ownerId: input.ownerId,
    ...(input.property !== undefined ? { searchConsoleProperty: input.property } : {}),
    ...(input.snapshot !== undefined ? { searchConsoleSnapshot: JSON.stringify(input.snapshot) } : {}),
    updatedAt: now,
  }).returning();
  return saved;
}

async function getSitesForOwner(ownerId: string): Promise<{ accessToken: string; accountEmail: string; sites: SearchConsoleSite[] }> {
  const access = await getGoogleSearchConsoleAccess(ownerId);
  const sites = await listSearchConsoleSites(access.accessToken);
  return { ...access, sites };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const productId = Number((await context.params).id);
    if (!Number.isSafeInteger(productId) || productId < 1) return Response.json({ error: "Product not found." }, { status: 404 });
    const { product, websiteUrl } = await getOwnedWebsiteProduct(productId, ownerId);
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
    if (!websiteUrl) return Response.json({ error: "Add a website destination to this product before using Search Console." }, { status: 400 });

    const db = getDb();
    const [connection] = await db.select().from(googleSearchConsoleConnections).where(eq(googleSearchConsoleConnections.ownerId, ownerId)).limit(1);
    const [oauthConfig] = await db.select().from(adminOAuthClients).where(eq(adminOAuthClients.providerId, "google-play")).limit(1);
    const record = await getProductSeoRecord(productId, ownerId);
    let sites: SearchConsoleSite[] = [];
    let connectionError = connection?.lastError ?? "";
    let accountEmail = connection?.accountEmail ?? "";
    let accountConnected = connection?.status === "connected";
    let needsReconnect = connection?.status === "reauthorize";
    if (connection?.status === "connected") {
      try {
        const result = await getSitesForOwner(ownerId);
        sites = result.sites.filter((site) => siteMatchesWebsite(site.siteUrl, websiteUrl));
        accountEmail = result.accountEmail;
        connectionError = "";
      } catch (error) {
        connectionError = error instanceof Error ? error.message : "Could not load Search Console properties.";
        if (connectionError.toLowerCase().includes("reconnect")) { accountConnected = false; needsReconnect = true; }
      }
    }
    const selectedProperty = record?.searchConsoleProperty ?? "";
    const snapshot = parse<Snapshot | null>(record?.searchConsoleSnapshot, null);
    return Response.json({
      connected: accountConnected,
      needsReconnect,
      oauthConfigured: Boolean(oauthConfig?.enabled),
      accountEmail,
      error: connectionError,
      sites,
      selectedProperty,
      snapshot,
      websiteUrl,
    });
  } catch {
    return Response.json({ error: "Could not load Google Search Console data." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const productId = Number((await context.params).id);
    if (!Number.isSafeInteger(productId) || productId < 1) return Response.json({ error: "Product not found." }, { status: 404 });
    const { product, websiteUrl } = await getOwnedWebsiteProduct(productId, ownerId);
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
    if (!websiteUrl) return Response.json({ error: "Add a website destination to this product before using Search Console." }, { status: 400 });

    const body = await request.json().catch(() => ({})) as { action?: unknown; property?: unknown };
    const { accessToken, sites } = await getSitesForOwner(ownerId);
    const validSites = sites.filter((site) => siteMatchesWebsite(site.siteUrl, websiteUrl));

    if (body.action === "select-property") {
      const property = typeof body.property === "string" ? body.property.trim() : "";
      if (!property || !validSites.some((site) => site.siteUrl === property)) return Response.json({ error: "Choose a Search Console property that matches this product’s website." }, { status: 400 });
      const saved = await saveSearchConsoleSettings({ productId, ownerId, property });
      return Response.json({ selectedProperty: saved.searchConsoleProperty, snapshot: parse(saved.searchConsoleSnapshot, null) });
    }

    const record = await getProductSeoRecord(productId, ownerId);
    const property = record?.searchConsoleProperty ?? "";
    if (!property || !validSites.some((site) => site.siteUrl === property)) return Response.json({ error: "Select a matching Search Console property before syncing its data." }, { status: 409 });

    const today = new Date();
    today.setUTCDate(today.getUTCDate() - 3); // Google data is often delayed; avoid implying the newest dates are complete.
    const endDate = today.toISOString().slice(0, 10);
    today.setUTCDate(today.getUTCDate() - 27);
    const startDate = today.toISOString().slice(0, 10);
    const [daily, queries, pages] = await Promise.all([
      querySearchConsole({ accessToken, siteUrl: property, startDate, endDate, dimensions: ["date"] }),
      querySearchConsole({ accessToken, siteUrl: property, startDate, endDate, dimensions: ["query"] }),
      querySearchConsole({ accessToken, siteUrl: property, startDate, endDate, dimensions: ["page"] }),
    ]);
    const clicks = daily.reduce((sum, row) => sum + row.clicks, 0);
    const impressions = daily.reduce((sum, row) => sum + row.impressions, 0);
    const weightedPosition = daily.reduce((sum, row) => sum + row.position * row.impressions, 0);
    const snapshot: Snapshot = {
      startDate,
      endDate,
      fetchedAt: new Date().toISOString(),
      totals: { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: impressions ? weightedPosition / impressions : 0 },
      daily,
      queries,
      pages,
    };
    await saveSearchConsoleSettings({ productId, ownerId, snapshot });
    return Response.json({ selectedProperty: property, snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not sync Search Console data.";
    return Response.json({ error: message }, { status: message.includes("reconnect") || message.includes("Connect a Google") ? 409 : 502 });
  }
}
