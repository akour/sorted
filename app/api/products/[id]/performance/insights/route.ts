import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { optimizationPlans, products, promoEvents } from "../../../../../../db/schema";
import { parseOptimizationStorage } from "../../../../../../lib/aso-experiments";
import { getOwnerId, ownerAuthenticationRequired } from "../../../../../../lib/owner";

function validProductId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = validProductId((await context.params).id);
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    if (!productId) return Response.json({ error: "Product not found." }, { status: 404 });

    const db = getDb();
    const [product] = await db.select({ id: products.id }).from(products)
      .where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1);
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });

    const [plan] = await db.select({ opportunities: optimizationPlans.opportunities })
      .from(optimizationPlans)
      .where(and(eq(optimizationPlans.productId, productId), eq(optimizationPlans.ownerId, ownerId)))
      .limit(1);
    const saved = parseOptimizationStorage(plan?.opportunities);
    const promotions = await db.select({
      id: promoEvents.id,
      title: promoEvents.title,
      eventType: promoEvents.eventType,
      status: promoEvents.status,
      startDate: promoEvents.startDate,
      endDate: promoEvents.endDate,
    }).from(promoEvents)
      .where(and(eq(promoEvents.productId, productId), eq(promoEvents.ownerId, ownerId)))
      .orderBy(asc(promoEvents.startDate), asc(promoEvents.id)).limit(200);

    return Response.json({ opportunities: saved.opportunities, experiments: saved.experiments, promotions });
  } catch {
    return Response.json({ error: "We could not load this product’s performance context." }, { status: 500 });
  }
}
