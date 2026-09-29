import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { optimizationPlans, products } from "../../../../../../db/schema";
import { fetchProductMetadata } from "../../../../../../lib/product-icons";
import { classifyProductUrl, normalizeProductUrlInput } from "../../../../../../lib/product-url";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    if (!Number.isSafeInteger(productId) || productId < 1) {
      return Response.json({ error: "Product not found." }, { status: 404 });
    }
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const payload = await request.json().catch(() => ({})) as { url?: unknown };
    const db = getDb();
    const [product] = await db.select().from(products)
      .where(and(eq(products.id, productId), eq(products.ownerId, ownerId)))
      .limit(1);
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });

    const rawUrl = typeof payload.url === "string" && payload.url.trim() ? payload.url : product.url;
    const sourceUrl = normalizeProductUrlInput(rawUrl);
    if (!sourceUrl) return Response.json({ error: "Add a valid public store listing URL before fetching metadata." }, { status: 400 });
    const linkKind = classifyProductUrl(sourceUrl);
    if (linkKind !== "google-play" && linkKind !== "app-store") {
      return Response.json({ error: "Use a Google Play or App Store listing URL to fetch store metadata." }, { status: 400 });
    }

    const [existing] = await db.select().from(optimizationPlans)
      .where(and(eq(optimizationPlans.productId, productId), eq(optimizationPlans.ownerId, ownerId)))
      .limit(1);
    let preview: Awaited<ReturnType<typeof fetchProductMetadata>> = null;
    try {
      preview = await fetchProductMetadata(sourceUrl);
    } catch {
      // Store pages can change shape without warning. Keep the last saved listing usable.
    }
    if (!preview?.currentListing) {
      const savedListing = parseSavedListing(existing?.currentListing, sourceUrl);
      if (savedListing) {
        return Response.json({
          currentListing: savedListing,
          warning: `The ${preview?.sourceLabel ?? "store"} listing did not allow a fresh fetch, so Sorted kept the last saved listing. Try again later to refresh it.`,
        });
      }
      return Response.json({ error: `We could not read the ${preview?.sourceLabel ?? "store"} listing. Try again or continue with the available product details.` }, { status: 502 });
    }
    const currentListing = preview.currentListing;
    if (existing) {
      await db.update(optimizationPlans).set({ currentListing: JSON.stringify(currentListing), updatedAt: new Date().toISOString() })
        .where(eq(optimizationPlans.id, existing.id));
    } else {
      await db.insert(optimizationPlans).values({ productId, ownerId, currentListing: JSON.stringify(currentListing) });
    }
    return Response.json({ currentListing });
  } catch {
    try {
      const productId = Number((await context.params).id);
      const ownerId = await getOwnerId();
      if (Number.isSafeInteger(productId) && productId > 0 && ownerId) {
        const db = getDb();
        const [savedPlan] = await db.select().from(optimizationPlans)
          .where(and(eq(optimizationPlans.productId, productId), eq(optimizationPlans.ownerId, ownerId)))
          .limit(1);
        const savedListing = parseSavedListing(savedPlan?.currentListing);
        if (savedListing) {
          return Response.json({
            currentListing: savedListing,
            warning: "The store listing could not be refreshed, so Sorted kept the last saved listing. Try again later to refresh it.",
          });
        }
      }
    } catch {
      // Preserve the original response when even the saved-listing fallback is unavailable.
    }
    return Response.json({ error: "We could not fetch the current listing metadata. Try again." }, { status: 502 });
  }
}

function parseSavedListing(raw: string | undefined, sourceUrl?: string): Record<string, unknown> | null {
  try {
    const listing = JSON.parse(raw ?? "{}") as Record<string, unknown>;
    const savedSourceUrl = typeof listing.sourceUrl === "string" ? normalizeProductUrlInput(listing.sourceUrl) : "";
    return (!sourceUrl || !savedSourceUrl || savedSourceUrl === sourceUrl) && typeof listing.platform === "string" && typeof listing.title === "string" && listing.title.trim()
      ? listing
      : null;
  } catch {
    return null;
  }
}
