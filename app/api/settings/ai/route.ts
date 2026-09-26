import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";
import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { aiSettings } from "../../../../db/schema";
import { DEFAULT_OPENCODE_MODEL, getOpenCodeModel, OPENCODE_MODELS } from "../../../../lib/opencode-models";

export async function GET() {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const db = getDb();
    const [saved] = await db.select().from(aiSettings).where(eq(aiSettings.ownerId, ownerId)).limit(1);
    const configuredModel = saved?.activeModel || env.OPENCODE_MODEL || DEFAULT_OPENCODE_MODEL;
    let fallbackModels: string[] = [];
    try {
      fallbackModels = JSON.parse(saved?.fallbackModels ?? "[]") as string[];
    } catch {
      fallbackModels = [];
    }
    return Response.json({
      models: OPENCODE_MODELS,
      activeModel: getOpenCodeModel(configuredModel)?.id ?? DEFAULT_OPENCODE_MODEL,
      fallbackModels: fallbackModels.filter((id) => Boolean(getOpenCodeModel(id))),
      hasApiKey: Boolean(env.OPENCODE_API_KEY),
      updatedAt: saved?.updatedAt ?? null,
    });
  } catch (error) {
    console.error("AI settings load failed", error);
    return Response.json({ error: "Could not load AI settings." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const body = await request.json() as { activeModel?: string; fallbackModels?: string[] };
    const activeModel = body.activeModel?.trim();
    const model = getOpenCodeModel(activeModel);
    if (!model) return Response.json({ error: "Choose a model from the OpenCode catalog." }, { status: 400 });
    const fallbackModels = Array.isArray(body.fallbackModels)
      ? body.fallbackModels.filter((id): id is string => Boolean(getOpenCodeModel(id)) && id !== activeModel).slice(0, 3)
      : [];

    const db = getDb();
    const now = new Date().toISOString();
    const values = { activeModel: model.id, fallbackModels: JSON.stringify(fallbackModels), updatedAt: now };
    const [saved] = await db.insert(aiSettings).values({ ownerId, ...values }).onConflictDoUpdate({ target: aiSettings.ownerId, set: values }).returning();
    return Response.json({ settings: { ...saved, fallbackModels }, model });
  } catch (error) {
    console.error("AI settings save failed", error);
    const detail = error instanceof Error ? error.message.slice(0, 180) : "";
    return Response.json({ error: ["Could not save AI settings.", detail].filter(Boolean).join(" ") }, { status: 500 });
  }
}
