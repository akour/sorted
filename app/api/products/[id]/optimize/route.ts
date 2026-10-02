import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { optimizationPlans } from "../../../../../db/schema";
import { parseLocalizedStoreListings, validateLocalizedStoreListings } from "../../../../../lib/google-play-localizations";
import { parseOptimizationStorage, stringifyOptimizationStorage } from "../../../../../lib/aso-experiments";

function parseJson(value: string | null | undefined, fallback: unknown[]) {
  try {
    const parsed = JSON.parse(value ?? "");
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseObject(value: string | null | undefined, fallback: Record<string, string>) {
  try {
    const parsed = JSON.parse(value ?? "");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, string> : fallback;
  } catch {
    return fallback;
  }
}

function emptyPlan(productId: number) {
  return { productId, focus: "ASO + AEO", storeTitle: "", storeSubtitle: "", storeShortDescription: "", storeLongDescription: "", answerSummary: "", currentListing: {}, localizedListings: [], opportunities: [], experiments: [], nextActions: [] };
}

function serialize(plan: typeof optimizationPlans.$inferSelect | undefined, productId: number) {
  if (!plan) return emptyPlan(productId);
  const { opportunities, experiments } = parseOptimizationStorage(plan.opportunities);
  return { ...plan, currentListing: parseObject(plan.currentListing, {}), localizedListings: parseLocalizedStoreListings(plan.localizedListings), opportunities, experiments, nextActions: parseJson(plan.nextActions, []) };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const [plan] = await getDb().select().from(optimizationPlans).where(and(eq(optimizationPlans.productId, productId), eq(optimizationPlans.ownerId, ownerId))).limit(1);
    return Response.json({ optimization: serialize(plan, productId) });
  } catch {
    return Response.json({ error: "We could not load the optimization plan." }, { status: 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const payload = await request.json() as Record<string, unknown>;
    const hasLocalizedListings = Array.isArray(payload.localizedListings);
    const db = getDb();
    const [existing] = await db.select().from(optimizationPlans).where(and(eq(optimizationPlans.productId, productId), eq(optimizationPlans.ownerId, ownerId))).limit(1);
    const savedOptimizationData = parseOptimizationStorage(existing?.opportunities);
    const values: Partial<typeof optimizationPlans.$inferInsert> = {
      focus: typeof payload.focus === "string" ? payload.focus.trim() : "ASO + AEO",
      storeTitle: typeof payload.storeTitle === "string" ? payload.storeTitle.trim() : "",
      storeSubtitle: typeof payload.storeSubtitle === "string" ? payload.storeSubtitle.trim() : "",
      storeShortDescription: typeof payload.storeShortDescription === "string" ? payload.storeShortDescription.trim() : "",
      storeLongDescription: typeof payload.storeLongDescription === "string" ? payload.storeLongDescription.trim() : "",
      answerSummary: typeof payload.answerSummary === "string" ? payload.answerSummary.trim() : "",
      currentListing: JSON.stringify(payload.currentListing && typeof payload.currentListing === "object" ? payload.currentListing : parseObject(existing?.currentListing, {})),
      opportunities: stringifyOptimizationStorage(Array.isArray(payload.opportunities) ? payload.opportunities : savedOptimizationData.opportunities, Array.isArray(payload.experiments) ? payload.experiments : savedOptimizationData.experiments),
      nextActions: JSON.stringify(Array.isArray(payload.nextActions) ? payload.nextActions : []),
      updatedAt: new Date().toISOString(),
    };
    if (hasLocalizedListings) values.localizedListings = JSON.stringify(validateLocalizedStoreListings(payload.localizedListings));
    const [optimization] = existing
      ? await db.update(optimizationPlans).set(values).where(eq(optimizationPlans.id, existing.id)).returning()
      : await db.insert(optimizationPlans).values({ productId, ownerId, ...values }).returning();
    return Response.json({ optimization: serialize(optimization, productId) });
  } catch {
    return Response.json({ error: "We could not save the optimization plan." }, { status: 500 });
  }
}
