import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { answerVisibilityProfiles, createBriefs, googlePlayOAuthStates, googlePlayPerformanceImports, googlePlayPerformanceRows, googlePlayPromoReportImports, googlePlayPromoReportRows, googlePlayPromoReportSources, googlePlayReportingSnapshots, keywordResearches, optimizationPlans, productConnections, productOauthConnections, products, publishPlans, researchBriefs, promoEvents, websiteSeoAudits } from "../../../../db/schema";
import { getInitialProductIconUrl } from "../../../../lib/product-icon-url";
import { classifyProductUrl, normalizeProductUrlInput } from "../../../../lib/product-url";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const productId = Number(id);
    const payload = (await request.json()) as { name?: string; type?: string; url?: string; websiteUrl?: string; googlePlayUrl?: string; appStoreUrl?: string; position?: string; audience?: string };
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const db = getDb();
    const [current] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1);
    if (!current) return Response.json({ error: "Product not found." }, { status: 404 });
    const rawNextUrl = payload.url === undefined ? current.url : payload.url.trim();
    const nextUrl = rawNextUrl ? normalizeProductUrlInput(rawNextUrl) : "";
    if (rawNextUrl && !nextUrl) return Response.json({ error: "Enter a valid public website, Google Play, or App Store link." }, { status: 400 });
    const urlChanged = nextUrl !== current.url;
    const destination = (key: "websiteUrl" | "googlePlayUrl" | "appStoreUrl", expected: "website" | "google-play" | "app-store") => {
      const raw = payload[key] === undefined ? (current[key] || (classifyProductUrl(current.url) === expected ? current.url : "")) : payload[key]!.trim();
      if (!raw) return { value: "" };
      const value = normalizeProductUrlInput(raw);
      return { value: value && classifyProductUrl(value) === expected ? value : null };
    };
    const website = destination("websiteUrl", "website");
    const googlePlay = destination("googlePlayUrl", "google-play");
    const appStore = destination("appStoreUrl", "app-store");
    if (website.value === null || googlePlay.value === null || appStore.value === null) return Response.json({ error: "Each destination must use its matching public website, Google Play, or Apple App Store URL." }, { status: 400 });
    const [product] = await db.update(products).set({
      ...(payload.name?.trim() ? { name: payload.name.trim() } : {}),
      ...(payload.type?.trim() ? { type: payload.type.trim() } : {}),
      ...(payload.url !== undefined ? { url: nextUrl } : {}),
      websiteUrl: website.value,
      googlePlayUrl: googlePlay.value,
      appStoreUrl: appStore.value,
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
    await db.delete(keywordResearches).where(and(eq(keywordResearches.productId, productId), eq(keywordResearches.ownerId, ownerId)));
    await db.delete(answerVisibilityProfiles).where(and(eq(answerVisibilityProfiles.productId, productId), eq(answerVisibilityProfiles.ownerId, ownerId)));
    await db.delete(websiteSeoAudits).where(and(eq(websiteSeoAudits.productId, productId), eq(websiteSeoAudits.ownerId, ownerId)));
    await db.delete(optimizationPlans).where(and(eq(optimizationPlans.productId, productId), eq(optimizationPlans.ownerId, ownerId)));
    await db.delete(productConnections).where(and(eq(productConnections.productId, productId), eq(productConnections.ownerId, ownerId)));
    await db.delete(productOauthConnections).where(and(eq(productOauthConnections.productId, productId), eq(productOauthConnections.ownerId, ownerId)));
    await db.delete(googlePlayOAuthStates).where(and(eq(googlePlayOAuthStates.productId, productId), eq(googlePlayOAuthStates.ownerId, ownerId)));
    await db.delete(googlePlayPerformanceRows).where(and(eq(googlePlayPerformanceRows.productId, productId), eq(googlePlayPerformanceRows.ownerId, ownerId)));
    await db.delete(googlePlayPerformanceImports).where(and(eq(googlePlayPerformanceImports.productId, productId), eq(googlePlayPerformanceImports.ownerId, ownerId)));
    await db.delete(googlePlayPromoReportRows).where(and(eq(googlePlayPromoReportRows.productId, productId), eq(googlePlayPromoReportRows.ownerId, ownerId)));
    await db.delete(googlePlayPromoReportImports).where(and(eq(googlePlayPromoReportImports.productId, productId), eq(googlePlayPromoReportImports.ownerId, ownerId)));
    await db.delete(googlePlayPromoReportSources).where(and(eq(googlePlayPromoReportSources.productId, productId), eq(googlePlayPromoReportSources.ownerId, ownerId)));
    await db.delete(googlePlayReportingSnapshots).where(and(eq(googlePlayReportingSnapshots.productId, productId), eq(googlePlayReportingSnapshots.ownerId, ownerId)));
    await db.delete(createBriefs).where(and(eq(createBriefs.productId, productId), eq(createBriefs.ownerId, ownerId)));
    await db.delete(publishPlans).where(and(eq(publishPlans.productId, productId), eq(publishPlans.ownerId, ownerId)));
    await db.delete(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId)));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "We could not delete that product." }, { status: 500 });
  }
}
