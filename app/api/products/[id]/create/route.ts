import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "../../../../../db";
import { createBriefs } from "../../../../../db/schema";

async function getOwnerId() {
  const requestHeaders = await headers();
  return requestHeaders.get("oai-authenticated-user-id") ?? "local-owner";
}

function parseJson(value: string | null | undefined, fallback: unknown) {
  try {
    return JSON.parse(value ?? "") ?? fallback;
  } catch {
    return fallback;
  }
}

function emptyBrief(productId: number) {
  return {
    productId,
    status: "draft",
    primaryMessage: "",
    storeVariants: [],
    answerBlocks: [],
    promoBrief: { theme: "", hook: "", body: "", cta: "", channels: [] },
    creativeBrief: { concept: "", visualDirection: "", frames: [], proofToShow: [] },
  };
}

function serialize(brief: typeof createBriefs.$inferSelect | undefined, productId: number) {
  if (!brief) return emptyBrief(productId);
  const promoBrief = parseJson(brief.promoBrief, {}) as Record<string, unknown>;
  const creativeBrief = parseJson(brief.creativeBrief, {}) as Record<string, unknown>;
  return {
    ...brief,
    storeVariants: parseJson(brief.storeVariants, []),
    answerBlocks: parseJson(brief.answerBlocks, []),
    promoBrief: {
      theme: typeof promoBrief.theme === "string" ? promoBrief.theme : "",
      hook: typeof promoBrief.hook === "string" ? promoBrief.hook : "",
      body: typeof promoBrief.body === "string" ? promoBrief.body : "",
      cta: typeof promoBrief.cta === "string" ? promoBrief.cta : "",
      channels: Array.isArray(promoBrief.channels) ? promoBrief.channels.filter((item): item is string => typeof item === "string") : [],
    },
    creativeBrief: {
      concept: typeof creativeBrief.concept === "string" ? creativeBrief.concept : "",
      visualDirection: typeof creativeBrief.visualDirection === "string" ? creativeBrief.visualDirection : "",
      frames: Array.isArray(creativeBrief.frames) ? creativeBrief.frames.filter((item): item is string => typeof item === "string") : [],
      proofToShow: Array.isArray(creativeBrief.proofToShow) ? creativeBrief.proofToShow.filter((item): item is string => typeof item === "string") : [],
    },
  };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    const ownerId = await getOwnerId();
    const [brief] = await getDb().select().from(createBriefs).where(and(eq(createBriefs.productId, productId), eq(createBriefs.ownerId, ownerId))).limit(1);
    return Response.json({ create: serialize(brief, productId) });
  } catch {
    return Response.json({ error: "We could not load the creation brief." }, { status: 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    const ownerId = await getOwnerId();
    const payload = await request.json() as Record<string, unknown>;
    const values = {
      status: typeof payload.status === "string" ? payload.status : "draft",
      primaryMessage: typeof payload.primaryMessage === "string" ? payload.primaryMessage.trim() : "",
      storeVariants: JSON.stringify(Array.isArray(payload.storeVariants) ? payload.storeVariants : []),
      answerBlocks: JSON.stringify(Array.isArray(payload.answerBlocks) ? payload.answerBlocks : []),
      promoBrief: JSON.stringify(payload.promoBrief && typeof payload.promoBrief === "object" ? payload.promoBrief : {}),
      creativeBrief: JSON.stringify(payload.creativeBrief && typeof payload.creativeBrief === "object" ? payload.creativeBrief : {}),
      updatedAt: new Date().toISOString(),
    };
    const db = getDb();
    const [existing] = await db.select().from(createBriefs).where(and(eq(createBriefs.productId, productId), eq(createBriefs.ownerId, ownerId))).limit(1);
    const [brief] = existing
      ? await db.update(createBriefs).set(values).where(eq(createBriefs.id, existing.id)).returning()
      : await db.insert(createBriefs).values({ productId, ownerId, ...values }).returning();
    return Response.json({ create: serialize(brief, productId) });
  } catch {
    return Response.json({ error: "We could not save the creation brief." }, { status: 500 });
  }
}
