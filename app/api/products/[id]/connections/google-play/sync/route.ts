import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../../db";
import { optimizationPlans, productConnections, products } from "../../../../../../../db/schema";
import { decryptProductConnectionSecret } from "../../../../../../../lib/admin-secrets";
import { fetchProductMetadata, type ProductListing } from "../../../../../../../lib/product-icons";
import { googlePlayErrorMessage, fetchGooglePlayListing, mergeGooglePlayListing, parseGooglePlayCredentials } from "../../../../../../../lib/google-play";
import { getOwnerId, ownerAuthenticationRequired } from "../../../../../../../lib/owner";
import { classifyProductUrl, normalizeProductUrlInput } from "../../../../../../../lib/product-url";

function parseListing(value: string | undefined): ProductListing | undefined {
  try {
    const parsed = JSON.parse(value ?? "{}") as ProductListing;
    return parsed && typeof parsed === "object" && parsed.platform === "Google Play" && typeof parsed.title === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function connectionResponse(connection: typeof productConnections.$inferSelect) {
  return {
    id: connection.id,
    provider: connection.provider,
    packageName: connection.packageName,
    locale: connection.locale,
    label: connection.label,
    credentialHint: connection.credentialHint,
    status: connection.status,
    lastTestedAt: connection.lastTestedAt,
    lastSyncedAt: connection.lastSyncedAt,
    lastError: connection.lastError,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    if (!Number.isSafeInteger(productId) || productId < 1) return Response.json({ error: "Product not found." }, { status: 404 });
    const db = getDb();
    const [product] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1);
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
    const [connection] = await db.select().from(productConnections).where(and(eq(productConnections.productId, productId), eq(productConnections.ownerId, ownerId), eq(productConnections.provider, "google-play"))).limit(1);
    if (!connection) return Response.json({ error: "Connect Google Play before syncing the listing." }, { status: 404 });
    const credentials = parseGooglePlayCredentials(await decryptProductConnectionSecret(connection.credentialsCiphertext));
    const sourceUrl = normalizeProductUrlInput(product.url) || `https://play.google.com/store/apps/details?id=${encodeURIComponent(connection.packageName)}`;
    const [existingPlan] = await db.select().from(optimizationPlans).where(and(eq(optimizationPlans.productId, productId), eq(optimizationPlans.ownerId, ownerId))).limit(1);
    const savedListing = parseListing(existingPlan?.currentListing);
    let publicListing = savedListing;
    if (classifyProductUrl(sourceUrl) === "google-play") {
      try {
        publicListing = (await fetchProductMetadata(sourceUrl))?.currentListing ?? publicListing;
      } catch {
        // The authenticated listing remains the source of truth when the public page is unavailable.
      }
    }
    const authenticatedListing = await fetchGooglePlayListing(credentials, connection.packageName, connection.locale);
    const currentListing = mergeGooglePlayListing(authenticatedListing, sourceUrl, publicListing);
    const now = new Date().toISOString();
    const [savedPlan] = existingPlan
      ? await db.update(optimizationPlans).set({ currentListing: JSON.stringify(currentListing), updatedAt: now }).where(eq(optimizationPlans.id, existingPlan.id)).returning()
      : await db.insert(optimizationPlans).values({ productId, ownerId, currentListing: JSON.stringify(currentListing) }).returning();
    const [syncedConnection] = await db.update(productConnections).set({ status: "connected", lastSyncedAt: now, lastError: null, updatedAt: now }).where(eq(productConnections.id, connection.id)).returning();
    return Response.json({ connection: connectionResponse(syncedConnection), currentListing, optimizationPlanId: savedPlan?.id ?? null });
  } catch (error) {
    const message = googlePlayErrorMessage(error);
    try {
      const productId = Number((await context.params).id);
      const ownerId = await getOwnerId();
      if (Number.isSafeInteger(productId) && productId > 0 && ownerId) {
        const db = getDb();
        const [connection] = await db.select().from(productConnections).where(and(eq(productConnections.productId, productId), eq(productConnections.ownerId, ownerId), eq(productConnections.provider, "google-play"))).limit(1);
        if (connection) await db.update(productConnections).set({ status: "error", lastError: message, updatedAt: new Date().toISOString() }).where(eq(productConnections.id, connection.id));
      }
    } catch {
      // Preserve the original sync error when recording it is unavailable.
    }
    return Response.json({ error: message }, { status: 422 });
  }
}
