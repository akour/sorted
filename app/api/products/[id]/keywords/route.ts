import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { googlePlayPerformanceRows, keywordResearches, optimizationPlans, products } from "../../../../../db/schema";
import { emptyKeywordResearch, keywordResearchStorage, observedKeywordCandidates, parseKeywordResearch, type KeywordResearch } from "../../../../../lib/keyword-research";

async function readKeywordResearch(productId: number, ownerId: string) {
  const db = getDb();
  const [saved, searchRows, plans] = await Promise.all([
    db.select().from(keywordResearches).where(and(eq(keywordResearches.productId, productId), eq(keywordResearches.ownerId, ownerId))).limit(1),
    db.select({ searchTerm: googlePlayPerformanceRows.searchTerm }).from(googlePlayPerformanceRows)
      .where(and(eq(googlePlayPerformanceRows.productId, productId), eq(googlePlayPerformanceRows.ownerId, ownerId))).limit(200),
    db.select().from(optimizationPlans).where(and(eq(optimizationPlans.productId, productId), eq(optimizationPlans.ownerId, ownerId))).limit(1),
  ]);
  const research = parseKeywordResearch(saved[0], productId);
  const plan = plans[0];
  let currentListing: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(plan?.currentListing ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) currentListing = parsed as Record<string, unknown>;
  } catch {
    // Listing coverage is optional evidence. A malformed old row should not block research.
  }
  const field = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const listing = {
    current: { title: field(currentListing.title), shortDescription: field(currentListing.shortDescription), longDescription: field(currentListing.longDescription ?? currentListing.fullDescription) },
    draft: { title: field(plan?.storeTitle), shortDescription: field(plan?.storeShortDescription), longDescription: field(plan?.storeLongDescription) },
  };
  return { research, observed: observedKeywordCandidates(searchRows.map((row) => row.searchTerm), research.keywords), listing };
}

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
    return Response.json(await readKeywordResearch(productId, ownerId));
  } catch {
    return Response.json({ error: "We could not load keyword research." }, { status: 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    if (!Number.isInteger(productId) || productId < 1 || !await ownerHasProduct(productId, ownerId)) return Response.json({ error: "Product not found." }, { status: 404 });
    const payload = await request.json() as Partial<KeywordResearch>;
    const research = { ...emptyKeywordResearch(productId), ...payload, productId };
    const values = { ...keywordResearchStorage(research), updatedAt: new Date().toISOString() };
    const db = getDb();
    const [existing] = await db.select().from(keywordResearches).where(and(eq(keywordResearches.productId, productId), eq(keywordResearches.ownerId, ownerId))).limit(1);
    const [saved] = existing
      ? await db.update(keywordResearches).set(values).where(eq(keywordResearches.id, existing.id)).returning()
      : await db.insert(keywordResearches).values({ productId, ownerId, ...values }).returning();
    const normalized = parseKeywordResearch(saved, productId);
    const { observed } = await readKeywordResearch(productId, ownerId);
    return Response.json({ research: normalized, observed });
  } catch {
    return Response.json({ error: "We could not save keyword research." }, { status: 500 });
  }
}
