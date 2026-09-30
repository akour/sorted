import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../../db";
import { asoExperiments, products } from "../../../../../../../db/schema";
import {
  isGooglePlayExperimentOutcome,
} from "../../../../../../../lib/google-play-experiments";

export async function PATCH(request: Request, context: { params: Promise<{ id: string; experimentId: string }> }) {
  try {
    const { id, experimentId: rawExperimentId } = await context.params;
    const productId = Number(id);
    const experimentId = Number(rawExperimentId);
    if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isSafeInteger(experimentId) || experimentId < 1) {
      return Response.json({ error: "Experiment not found." }, { status: 404 });
    }
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const db = getDb();
    const [product] = await db.select({ id: products.id }).from(products)
      .where(and(eq(products.id, productId), eq(products.ownerId, ownerId)))
      .limit(1);
    if (!product) return Response.json({ error: "Experiment not found." }, { status: 404 });
    const [experiment] = await db.select().from(asoExperiments)
      .where(and(eq(asoExperiments.id, experimentId), eq(asoExperiments.productId, productId), eq(asoExperiments.ownerId, ownerId)))
      .limit(1);
    if (!experiment) return Response.json({ error: "Experiment not found." }, { status: 404 });

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Enter a valid experiment update." }, { status: 400 });
    const payload = body as Record<string, unknown>;
    const now = new Date().toISOString();
    let values: Partial<typeof asoExperiments.$inferInsert>;

    if (payload.action === "start") {
      if (experiment.status !== "planned") return Response.json({ error: "Only a planned experiment can be marked as running." }, { status: 409 });
      values = { status: "running", startedAt: now, updatedAt: now };
    } else if (payload.action === "record-result") {
      if (experiment.status !== "running") return Response.json({ error: "Only a running experiment can record a Play Console result." }, { status: 409 });
      if (!isGooglePlayExperimentOutcome(payload.outcome)) return Response.json({ error: "Choose the outcome reported by Play Console." }, { status: 400 });
      const notes = typeof payload.notes === "string" ? payload.notes.trim() : "";
      if (notes.length > 2_000) return Response.json({ error: "Result notes must be 2,000 characters or fewer." }, { status: 400 });
      const needsMoreData = payload.outcome === "more_data_needed";
      values = {
        outcome: payload.outcome,
        outcomeNotes: notes,
        status: needsMoreData ? "running" : "completed",
        completedAt: needsMoreData ? null : now,
        updatedAt: now,
      };
    } else if (payload.action === "cancel") {
      if (experiment.status !== "planned" && experiment.status !== "running") return Response.json({ error: "Only an active experiment can be cancelled." }, { status: 409 });
      values = { status: "cancelled", updatedAt: now };
    } else {
      return Response.json({ error: "Choose start, record-result, or cancel." }, { status: 400 });
    }

    const [updated] = await db.update(asoExperiments).set(values)
      .where(and(eq(asoExperiments.id, experimentId), eq(asoExperiments.productId, productId), eq(asoExperiments.ownerId, ownerId)))
      .returning();
    const safeExperiment = Object.fromEntries(Object.entries(updated).filter(([key]) => key !== "ownerId"));
    return Response.json({ experiment: safeExperiment });
  } catch {
    return Response.json({ error: "We could not update this experiment." }, { status: 500 });
  }
}
