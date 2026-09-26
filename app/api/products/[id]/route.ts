import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { createBriefs, optimizationPlans, products, publishPlans, researchBriefs, promoEvents } from "../../../../db/schema";
import { getInitialProductIconUrl } from "../../../../lib/product-icon-url";
import { normalizeProductUrlInput } from "../../../../lib/product-url";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const productId = Number(id);
    const payload = (await request.json()) as { name?: string; type?: string; url?: string; position?: string; audience?: string };
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const db = getDb();
    const [current] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1);
    if (!current) return Response.json({ error: "Product not found." }, { status: 404 });
    const rawNextUrl = payload.url === undefined ? current.url : payload.url.trim();
    const nextUrl = rawNextUrl ? normalizeProductUrlInput(rawNextUrl) : "";
    if (rawNextUrl && !nextUrl) return Response.json({ error: "Enter a valid public website, Google Play, or App Store link." }, { status: 400 });
    const urlChanged = nextUrl !== current.url;
    const [product] = await db.update(products).set({
      ...(payload.name?.trim() ? { name: payload.name.trim() } : {}),
      ...(payload.type?.trim() ? { type: payload.type.trim() } : {}),
      ...(payload.url !== undefined ? { url: nextUrl } : {}),
      ...(urlChanged ? { iconUrl: getInitialProductIconUrl(nextUrl) } : {}),
      ...(payload.position !== undefined ? { position: payload.position.trim() } : {}),
      ...(payload.audience !== undefined ? { audience: payload.audience.trim() } : {}),
      updatedAt: new Date().toISOString(),
    }).where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).returning();
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
    if (urlChanged) {
      const [existingPlan] = await db.select().from(optimizationPlans)
        .where(and(eq(optimizationPlans.productId, productId), eq(optimizationPlans.ownerId, ownerId)))
        .limit(1);
      if (existingPlan) await db.update(optimizationPlans).set({ currentListing: "{}", updatedAt: new Date().toISOString() }).where(eq(optimizationPlans.id, existingPlan.id));
    }
    return Response.json({ product });
  } catch {
    return Response.json({ error: "We could not save those product changes." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const db = getDb();
    const [product] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1);
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
    await db.delete(promoEvents).where(and(eq(promoEvents.productId, productId), eq(promoEvents.ownerId, ownerId)));
    await db.delete(researchBriefs).where(and(eq(researchBriefs.productId, productId), eq(researchBriefs.ownerId, ownerId)));
    await db.delete(optimizationPlans).where(and(eq(optimizationPlans.productId, productId), eq(optimizationPlans.ownerId, ownerId)));
    await db.delete(createBriefs).where(and(eq(createBriefs.productId, productId), eq(createBriefs.ownerId, ownerId)));
    await db.delete(publishPlans).where(and(eq(publishPlans.productId, productId), eq(publishPlans.ownerId, ownerId)));
    await db.delete(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId)));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "We could not delete that product." }, { status: 500 });
  }
}
