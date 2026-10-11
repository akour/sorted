import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { answerVisibilityProfiles, products } from "../../../../../db/schema";
import { answerVisibilityStorage, emptyAnswerVisibility, parseAnswerVisibility, type AnswerVisibilityProfile } from "../../../../../lib/answer-visibility";

async function ownerHasProduct(productId: number, ownerId: string) {
  const [product] = await getDb().select({ id: products.id }).from(products)
    .where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1);
  return Boolean(product);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    if (!Number.isInteger(productId) || productId < 1 || !await ownerHasProduct(productId, ownerId)) return Response.json({ error: "Product not found." }, { status: 404 });
    const [saved] = await getDb().select().from(answerVisibilityProfiles)
      .where(and(eq(answerVisibilityProfiles.productId, productId), eq(answerVisibilityProfiles.ownerId, ownerId))).limit(1);
    return Response.json({ profile: parseAnswerVisibility(saved, productId) });
  } catch {
    return Response.json({ error: "We could not load answer visibility work." }, { status: 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    if (!Number.isInteger(productId) || productId < 1 || !await ownerHasProduct(productId, ownerId)) return Response.json({ error: "Product not found." }, { status: 404 });
    const payload = await request.json() as Partial<AnswerVisibilityProfile>;
    const profile = { ...emptyAnswerVisibility(productId), ...payload, productId };
    const values = { ...answerVisibilityStorage(profile), updatedAt: new Date().toISOString() };
    const db = getDb();
    const [existing] = await db.select().from(answerVisibilityProfiles)
      .where(and(eq(answerVisibilityProfiles.productId, productId), eq(answerVisibilityProfiles.ownerId, ownerId))).limit(1);
    const [saved] = existing
      ? await db.update(answerVisibilityProfiles).set(values).where(eq(answerVisibilityProfiles.id, existing.id)).returning()
      : await db.insert(answerVisibilityProfiles).values({ productId, ownerId, ...values }).returning();
    return Response.json({ profile: parseAnswerVisibility(saved, productId) });
  } catch {
    return Response.json({ error: "We could not save answer visibility work." }, { status: 500 });
  }
}
