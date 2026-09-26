import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "../../../db";
import { optimizationPlans, products } from "../../../db/schema";
import { isSafeProductIconUrl, type ProductListing } from "../../../lib/product-icons";
import { getInitialProductIconUrl } from "../../../lib/product-icon-url";
import { classifyProductUrl, normalizeProductUrlInput } from "../../../lib/product-url";

async function getOwnerId() {
  const requestHeaders = await headers();
  return requestHeaders.get("oai-authenticated-user-id") ?? "local-owner";
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table") || message.includes("products")) {
    return "The product database is not ready yet. Publish the latest version to apply its database migration.";
  }
  return "We could not reach the product workspace. Try again.";
}

export async function GET() {
  try {
    const ownerId = await getOwnerId();
    const db = getDb();
    const [rows, plans] = await Promise.all([
      db.select().from(products).where(eq(products.ownerId, ownerId)).orderBy(desc(products.updatedAt), desc(products.id)),
      db.select({ productId: optimizationPlans.productId, currentListing: optimizationPlans.currentListing })
        .from(optimizationPlans).where(eq(optimizationPlans.ownerId, ownerId)),
    ]);
    const listings = new Map(plans.map((plan) => [plan.productId, plan.currentListing]));
    const hydratedRows = rows.map((product) => ({
      ...product,
      hasCurrentListing: hasMatchingCurrentListing(product.url, listings.get(product.id)),
    }));
    return Response.json({ products: hydratedRows });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { name?: string; type?: string; url?: string; position?: string; audience?: string; iconUrl?: string; currentListing?: Partial<ProductListing> };
    const name = payload.name?.trim() ?? "";
    const type = payload.type?.trim() ?? "";
    if (!name || !type) return Response.json({ error: "Product name and type are required." }, { status: 400 });

    const ownerId = await getOwnerId();
    const rawUrl = payload.url?.trim() ?? "";
    const url = rawUrl ? normalizeProductUrlInput(rawUrl) : "";
    if (rawUrl && !url) return Response.json({ error: "Enter a valid public website, Google Play, or App Store link." }, { status: 400 });
    const linkKind = url ? classifyProductUrl(url) : null;
    const importedIcon = payload.iconUrl && isSafeProductIconUrl(payload.iconUrl) ? payload.iconUrl : "";
    const iconUrl = linkKind === "website"
      ? importedIcon || getInitialProductIconUrl(url)
      : linkKind && importedIcon ? importedIcon : "";
    const importedListing = payload.currentListing && url && payload.currentListing.sourceUrl === url
      && ((linkKind === "google-play" && payload.currentListing.platform === "Google Play")
        || (linkKind === "app-store" && payload.currentListing.platform === "App Store"))
      ? {
        platform: payload.currentListing.platform,
        title: cleanImportedValue(payload.currentListing.title, 300),
        subtitle: cleanImportedValue(payload.currentListing.subtitle, 500),
        shortDescription: cleanImportedValue(payload.currentListing.shortDescription, 4_000),
        longDescription: cleanImportedValue(payload.currentListing.longDescription, 60_000, true),
        sourceUrl: url,
        fetchedAt: new Date().toISOString(),
        ...(payload.currentListing.category ? { category: cleanImportedValue(payload.currentListing.category, 200) } : {}),
        ...(payload.currentListing.developer ? { developer: cleanImportedValue(payload.currentListing.developer, 300) } : {}),
        ...(payload.currentListing.iconUrl && isSafeProductIconUrl(payload.currentListing.iconUrl) ? { iconUrl: payload.currentListing.iconUrl } : {}),
        ...(payload.currentListing.bundleId ? { bundleId: cleanImportedValue(payload.currentListing.bundleId, 300) } : {}),
        ...(payload.currentListing.storeId ? { storeId: cleanImportedValue(payload.currentListing.storeId, 100) } : {}),
      }
      : null;
    const db = getDb();
    const [product] = await db.insert(products).values({
      ownerId,
      name,
      type,
      url,
      iconUrl,
      position: payload.position?.trim() ?? "",
      audience: payload.audience?.trim() ?? "",
    }).returning();
    let currentListingSaved = false;
    if (product && importedListing) {
      try {
        await db.insert(optimizationPlans).values({ productId: product.id, ownerId, currentListing: JSON.stringify(importedListing) });
        currentListingSaved = true;
      } catch {
        // Keep the product creation successful; Optimize can fetch the listing again later.
      }
    }
    return Response.json({ product, currentListingSaved }, { status: 201 });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

function cleanImportedValue(value: unknown, maximum: number, keepParagraphs = false): string {
  if (typeof value !== "string") return "";
  const normalized = keepParagraphs
    ? value.replace(/\r/g, "").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n\n")
    : value.replace(/\s+/g, " ").trim();
  return normalized.slice(0, maximum);
}

function hasMatchingCurrentListing(url: string, rawListing: string | undefined): boolean {
  const kind = classifyProductUrl(url);
  if (kind !== "google-play" && kind !== "app-store") return false;
  try {
    const listing = JSON.parse(rawListing ?? "{}") as { platform?: string; sourceUrl?: string };
    const expectedPlatform = kind === "google-play" ? "Google Play" : "App Store";
    return listing.platform === expectedPlatform && listing.sourceUrl === normalizeProductUrlInput(url);
  } catch {
    return false;
  }
}
