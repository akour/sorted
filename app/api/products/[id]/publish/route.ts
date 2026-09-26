import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "../../../../../db";
import { createBriefs, optimizationPlans, products, publishPlans, researchBriefs } from "../../../../../db/schema";
import { canMarkPublishReady, getPublishReadiness } from "../../../../../lib/publish-readiness";

async function getOwnerId() {
  const requestHeaders = await headers();
  return requestHeaders.get("oai-authenticated-user-id") ?? "local-owner";
}

function parseJson(value: string | null | undefined, fallback: unknown[]) {
  try {
    const parsed = JSON.parse(value ?? "");
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function defaultChannels() {
  return [
    { name: "Google Play", status: "draft", note: "", lastExportedAt: "" },
    { name: "App Store", status: "draft", note: "", lastExportedAt: "" },
    { name: "Website / AEO", status: "draft", note: "", lastExportedAt: "" },
  ];
}

function defaultChecklist() {
  return [
    { label: "Review the research foundation", area: "Research", done: false },
    { label: "Confirm store copy and character limits", area: "Optimize", done: false },
    { label: "Approve copy, answers, and creative direction", area: "Create", done: false },
    { label: "Export the channel packet", area: "Publish", done: false },
  ];
}

function emptyPlan(productId: number) {
  return { productId, status: "draft", channels: defaultChannels(), checklist: defaultChecklist(), releaseNotes: "" };
}

function serialize(plan: typeof publishPlans.$inferSelect | undefined, productId: number) {
  if (!plan) return emptyPlan(productId);
  return { ...plan, channels: parseJson(plan.channels, defaultChannels()), checklist: parseJson(plan.checklist, defaultChecklist()) };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    const ownerId = await getOwnerId();
    const db = getDb();
    const [product] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1);
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
    const [plan] = await db.select().from(publishPlans).where(and(eq(publishPlans.productId, productId), eq(publishPlans.ownerId, ownerId))).limit(1);
    const [research] = await db.select().from(researchBriefs).where(and(eq(researchBriefs.productId, productId), eq(researchBriefs.ownerId, ownerId))).limit(1);
    const [optimization] = await db.select().from(optimizationPlans).where(and(eq(optimizationPlans.productId, productId), eq(optimizationPlans.ownerId, ownerId))).limit(1);
    const [create] = await db.select().from(createBriefs).where(and(eq(createBriefs.productId, productId), eq(createBriefs.ownerId, ownerId))).limit(1);
    const readiness = getPublishReadiness({ research, optimization, create });
    const publish = serialize(plan, productId);
    if ((publish.status === "ready" || publish.status === "published") && !canMarkPublishReady(readiness, publish.checklist)) {
      publish.status = "review";
    }
    return Response.json({
      publish,
      readiness,
    });
  } catch {
    return Response.json({ error: "We could not load the publishing workspace." }, { status: 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    const ownerId = await getOwnerId();
    const payload = await request.json() as Record<string, unknown>;
    const db = getDb();
    const [research] = await db.select().from(researchBriefs).where(and(eq(researchBriefs.productId, productId), eq(researchBriefs.ownerId, ownerId))).limit(1);
    const [optimization] = await db.select().from(optimizationPlans).where(and(eq(optimizationPlans.productId, productId), eq(optimizationPlans.ownerId, ownerId))).limit(1);
    const [create] = await db.select().from(createBriefs).where(and(eq(createBriefs.productId, productId), eq(createBriefs.ownerId, ownerId))).limit(1);
    const readiness = getPublishReadiness({ research, optimization, create });
    const checklist = Array.isArray(payload.checklist) ? payload.checklist : defaultChecklist();
    const requestedStatus = payload.status === "review" || payload.status === "ready" || payload.status === "published" ? payload.status : "draft";
    const status = (requestedStatus === "ready" || requestedStatus === "published") && !canMarkPublishReady(readiness, checklist)
      ? "review"
      : requestedStatus;
    const values = {
      status,
      channels: JSON.stringify(Array.isArray(payload.channels) ? payload.channels : defaultChannels()),
      checklist: JSON.stringify(checklist),
      releaseNotes: typeof payload.releaseNotes === "string" ? payload.releaseNotes.trim() : "",
      updatedAt: new Date().toISOString(),
    };
    const [existing] = await db.select().from(publishPlans).where(and(eq(publishPlans.productId, productId), eq(publishPlans.ownerId, ownerId))).limit(1);
    const [plan] = existing
      ? await db.update(publishPlans).set(values).where(eq(publishPlans.id, existing.id)).returning()
      : await db.insert(publishPlans).values({ productId, ownerId, ...values }).returning();
    return Response.json({ publish: serialize(plan, productId), statusAdjusted: status !== requestedStatus });
  } catch {
    return Response.json({ error: "We could not save the publishing workspace." }, { status: 500 });
  }
}
