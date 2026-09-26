import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "../../../../../db";
import { researchBriefs } from "../../../../../db/schema";

async function getOwnerId() {
  const requestHeaders = await headers();
  return requestHeaders.get("oai-authenticated-user-id") ?? "local-owner";
}

function emptyBrief(productId: number) {
  return { productId, intent: "", semanticCore: "", competitors: "", proof: "", notes: "" };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    const ownerId = await getOwnerId();
    const [research] = await getDb().select().from(researchBriefs).where(and(eq(researchBriefs.productId, productId), eq(researchBriefs.ownerId, ownerId))).limit(1);
    return Response.json({ research: research ?? emptyBrief(productId) });
  } catch {
    return Response.json({ error: "We could not load the research brief." }, { status: 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    const ownerId = await getOwnerId();
    const payload = (await request.json()) as { intent?: string; semanticCore?: string; competitors?: string; proof?: string; notes?: string };
    const values = {
      intent: payload.intent?.trim() ?? "",
      semanticCore: payload.semanticCore?.trim() ?? "",
      competitors: payload.competitors?.trim() ?? "",
      proof: payload.proof?.trim() ?? "",
      notes: payload.notes?.trim() ?? "",
      updatedAt: new Date().toISOString(),
    };
    const db = getDb();
    const [existing] = await db.select().from(researchBriefs).where(and(eq(researchBriefs.productId, productId), eq(researchBriefs.ownerId, ownerId))).limit(1);
    const [research] = existing
      ? await db.update(researchBriefs).set(values).where(eq(researchBriefs.id, existing.id)).returning()
      : await db.insert(researchBriefs).values({ productId, ownerId, ...values }).returning();
    return Response.json({ research });
  } catch {
    return Response.json({ error: "We could not save the research brief." }, { status: 500 });
  }
}
