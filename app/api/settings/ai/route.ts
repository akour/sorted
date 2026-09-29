import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";
import { getOpenCodeRuntime } from "../../../../lib/ai-runtime";
import { DEFAULT_OPENCODE_MODEL, getOpenCodeModel, OPENCODE_MODELS } from "../../../../lib/opencode-models";

export async function GET() {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const runtime = await getOpenCodeRuntime();
    const configuredModel = runtime.model || DEFAULT_OPENCODE_MODEL;
    return Response.json({
      models: OPENCODE_MODELS,
      activeModel: getOpenCodeModel(configuredModel)?.id ?? DEFAULT_OPENCODE_MODEL,
      fallbackModels: runtime.fallbackModels.filter((id) => Boolean(getOpenCodeModel(id))),
      hasApiKey: Boolean(runtime.apiKey),
      updatedAt: null,
      managedByAdmin: runtime.source === "managed",
    });
  } catch (error) {
    console.error("AI settings load failed", error);
    return Response.json({ error: "Could not load AI settings." }, { status: 500 });
  }
}

export async function PATCH() {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    return Response.json({ error: "AI routing is managed from the administrator portal." }, { status: 403 });
  } catch (error) {
    console.error("AI settings save failed", error);
    const detail = error instanceof Error ? error.message.slice(0, 180) : "";
    return Response.json({ error: ["Could not save AI settings.", detail].filter(Boolean).join(" ") }, { status: 500 });
  }
}
