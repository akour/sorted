import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { optimizationPlans } from "../../../../../db/schema";

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
  return { productId, focus: "ASO + AEO", storeTitle: "", storeSubtitle: "", storeShortDescription: "", storeLongDescription: "", answerSummary: "", currentListing: {}, opportunities: [], nextActions: [] };
}

function serialize(plan: typeof optimizationPlans.$inferSelect | undefined, productId: number) {
  if (!plan) return emptyPlan(productId);
  return { ...plan, currentListing: parseObject(plan.currentListing, {}), opportunities: parseJson(plan.opportunities, []), nextActions: parseJson(plan.nextActions, []) };
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
    const values = {
      focus: typeof payload.focus === "string" ? payload.focus.trim() : "ASO + AEO",
      storeTitle: typeof payload.storeTitle === "string" ? payload.storeTitle.trim() : "",
      storeSubtitle: typeof payload.storeSubtitle === "string" ? payload.storeSubtitle.trim() : "",
      storeShortDescription: typeof payload.storeShortDescription === "string" ? payload.storeShortDescription.trim() : "",
      storeLongDescription: typeof payload.storeLongDescription === "string" ? payload.storeLongDescription.trim() : "",
      answerSummary: typeof payload.answerSummary === "string" ? payload.answerSummary.trim() : "",
      currentListing: JSON.stringify(payload.currentListing && typeof payload.currentListing === "object" ? payload.currentListing : {}),
      opportunities: JSON.stringify(Array.isArray(payload.opportunities) ? payload.opportunities : []),
      nextActions: JSON.stringify(Array.isArray(payload.nextActions) ? payload.nextActions : []),
      updatedAt: new Date().toISOString(),
    };
    const db = getDb();
    const [existing] = await db.select().from(optimizationPlans).where(and(eq(optimizationPlans.productId, productId), eq(optimizationPlans.ownerId, ownerId))).limit(1);
    const [optimization] = existing
      ? await db.update(optimizationPlans).set(values).where(eq(optimizationPlans.id, existing.id)).returning()
      : await db.insert(optimizationPlans).values({ productId, ownerId, ...values }).returning();
    return Response.json({ optimization: serialize(optimization, productId) });
  } catch {
    return Response.json({ error: "We could not save the optimization plan." }, { status: 500 });
  }
}
