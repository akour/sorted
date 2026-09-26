import { and, asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "../../../db";
import { products, promoEvents } from "../../../db/schema";

async function getOwnerId() {
  const requestHeaders = await headers();
  return requestHeaders.get("oai-authenticated-user-id") ?? "local-owner";
}

function parseObject(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseArray(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function serializeEvent(event: typeof promoEvents.$inferSelect, productName?: string) {
  return { ...event, productName, eventBrief: parseObject(event.eventBrief), googlePlay: parseObject(event.googlePlay), appleEvent: parseObject(event.appleEvent), siteEntry: parseObject(event.siteEntry), localization: parseArray(event.localization), creative: parseObject(event.creative) };
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? JSON.stringify(value) : "{}";
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? JSON.stringify(value) : "[]";
}

export async function GET() {
  try {
    const ownerId = await getOwnerId();
    const rows = await getDb().select({ event: promoEvents, productName: products.name }).from(promoEvents).innerJoin(products, eq(promoEvents.productId, products.id)).where(eq(promoEvents.ownerId, ownerId)).orderBy(asc(promoEvents.startDate), asc(promoEvents.id));
    return Response.json({ events: rows.map((row) => serializeEvent(row.event, row.productName)) });
  } catch {
    return Response.json({ error: "We could not load the promo calendar." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const productId = Number(payload.productId);
    const startDate = typeof payload.startDate === "string" ? payload.startDate : "";
    const endDate = typeof payload.endDate === "string" ? payload.endDate : "";
    if (startDate && endDate && endDate < startDate) return Response.json({ error: "End date must be on or after the start date." }, { status: 400 });
    const ownerId = await getOwnerId();
    const db = getDb();
    const [product] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1);
    if (!product) return Response.json({ error: "Choose a product for this event." }, { status: 400 });
    const [event] = await db.insert(promoEvents).values({
      productId,
      ownerId,
      title: typeof payload.title === "string" ? payload.title.trim() : "",
      eventType: typeof payload.eventType === "string" ? payload.eventType : "feature",
      status: typeof payload.status === "string" ? payload.status : "planned",
      startDate,
      endDate,
      theme: typeof payload.theme === "string" ? payload.theme.trim() : "",
      objective: typeof payload.objective === "string" ? payload.objective.trim() : "",
      eventBrief: objectValue(payload.eventBrief),
      googlePlay: objectValue(payload.googlePlay),
      appleEvent: objectValue(payload.appleEvent),
      siteEntry: objectValue(payload.siteEntry),
      localization: arrayValue(payload.localization),
      creative: objectValue(payload.creative),
      updatedAt: new Date().toISOString(),
    }).returning();
    return Response.json({ event: serializeEvent(event, product.name) }, { status: 201 });
  } catch {
    return Response.json({ error: "We could not create the promo event." }, { status: 500 });
  }
}
