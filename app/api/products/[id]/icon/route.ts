import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "../../../../../db";
import { optimizationPlans, products } from "../../../../../db/schema";
import { fetchProductMetadata } from "../../../../../lib/product-icons";

async function getOwnerId() {
  const requestHeaders = await headers();
  return requestHeaders.get("oai-authenticated-user-id") ?? "local-owner";
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    if (!Number.isSafeInteger(productId) || productId < 1) {
      return Response.json({ error: "Product not found." }, { status: 404 });
    }
    const ownerId = await getOwnerId();
    const db = getDb();
    const [product] = await db.select().from(products)
      .where(and(eq(products.id, productId), eq(products.ownerId, ownerId)))
      .limit(1);
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });

    const preview = await fetchProductMetadata(product.url);
    if (!preview) return Response.json({ product, iconStatus: "unavailable" });
    const urlChanged = preview.url !== product.url;
    const [updated] = preview.iconUrl || urlChanged
      ? await db.update(products).set({
        ...(preview.iconUrl ? { iconUrl: preview.iconUrl } : {}),
        ...(urlChanged ? { url: preview.url } : {}),
      })
        .where(and(eq(products.id, productId), eq(products.ownerId, ownerId), eq(products.url, product.url)))
        .returning()
      : await db.select().from(products)
        .where(and(eq(products.id, productId), eq(products.ownerId, ownerId), eq(products.url, product.url)))
        .limit(1);
    if (!updated) return Response.json({ error: "The product link changed while its icon was being fetched." }, { status: 409 });

    if (preview.currentListing || urlChanged) {
      const [existingPlan] = await db.select().from(optimizationPlans)
        .where(and(eq(optimizationPlans.productId, productId), eq(optimizationPlans.ownerId, ownerId)))
        .limit(1);
      if (preview.currentListing) {
        const values = { currentListing: JSON.stringify(preview.currentListing), updatedAt: new Date().toISOString() };
        if (existingPlan) await db.update(optimizationPlans).set(values).where(eq(optimizationPlans.id, existingPlan.id));
        else await db.insert(optimizationPlans).values({ productId, ownerId, ...values });
      } else if (existingPlan) {
        await db.update(optimizationPlans).set({ currentListing: "{}", updatedAt: new Date().toISOString() }).where(eq(optimizationPlans.id, existingPlan.id));
      }
    }

    return Response.json({
      product: { ...updated, hasCurrentListing: Boolean(preview.currentListing) },
      iconStatus: preview.iconUrl ? "ready" : "unavailable",
      metadataStatus: preview.currentListing ? "ready" : "unavailable",
    });
  } catch {
    return Response.json({ error: "The product was saved, but its icon could not be updated." }, { status: 500 });
  }
}
