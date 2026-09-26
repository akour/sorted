import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "../../../../db";
import { products, promoEvents } from "../../../../db/schema";
import { serializeEvent } from "../route";

async function getOwnerId() {
  const requestHeaders = await headers();
  return requestHeaders.get("oai-authenticated-user-id") ?? "local-owner";
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? JSON.stringify(value) : "{}";
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? JSON.stringify(value) : "[]";
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const eventId = Number((await context.params).id);
    const ownerId = await getOwnerId();
    const payload = await request.json() as Record<string, unknown>;
    const db = getDb();
    const [existing] = await db.select().from(promoEvents).where(and(eq(promoEvents.id, eventId), eq(promoEvents.ownerId, ownerId))).limit(1);
    if (!existing) return Response.json({ error: "Promo event not found." }, { status: 404 });
    const productId = Number(payload.productId ?? existing.productId);
    const startDate = typeof payload.startDate === "string" ? payload.startDate : existing.startDate;
    const endDate = typeof payload.endDate === "string" ? payload.endDate : existing.endDate;
    if (startDate && endDate && endDate < startDate) return Response.json({ error: "End date must be on or after the start date." }, { status: 400 });
    const [product] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1);
    if (!product) return Response.json({ error: "Choose a valid product for this event." }, { status: 400 });
    const [event] = await db.update(promoEvents).set({
      productId,
      title: typeof payload.title === "string" ? payload.title.trim() : existing.title,
      eventType: typeof payload.eventType === "string" ? payload.eventType : existing.eventType,
      status: typeof payload.status === "string" ? payload.status : existing.status,
      startDate,
      endDate,
      theme: typeof payload.theme === "string" ? payload.theme.trim() : existing.theme,
      objective: typeof payload.objective === "string" ? payload.objective.trim() : existing.objective,
      eventBrief: objectValue(payload.eventBrief),
      googlePlay: objectValue(payload.googlePlay),
      appleEvent: objectValue(payload.appleEvent),
      siteEntry: objectValue(payload.siteEntry),
      localization: arrayValue(payload.localization),
      creative: objectValue(payload.creative),
      updatedAt: new Date().toISOString(),
    }).where(eq(promoEvents.id, eventId)).returning();
    return Response.json({ event: serializeEvent(event, product.name) });
  } catch {
    return Response.json({ error: "We could not save the promo event." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const eventId = Number((await context.params).id);
    const ownerId = await getOwnerId();
    const [event] = await getDb().delete(promoEvents).where(and(eq(promoEvents.id, eventId), eq(promoEvents.ownerId, ownerId))).returning({ id: promoEvents.id });
    if (!event) return Response.json({ error: "Promo event not found." }, { status: 404 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "We could not delete that promo event." }, { status: 500 });
  }
}
