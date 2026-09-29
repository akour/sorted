import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";
import { getOpenCodeRuntime } from "../../../../../lib/ai-runtime";
import { getOpenCodeModel } from "../../../../../lib/opencode-models";
import { requestOpenCode, safeOpenCodeFailureDetails } from "../../../../../lib/opencode-client";

export async function POST(request: Request) {
  try {
    if (!(await getOwnerId())) return ownerAuthenticationRequired();
    const runtime = await getOpenCodeRuntime();
    const apiKey = runtime.apiKey;
    if (!apiKey) return Response.json({ error: "OpenCode is not connected yet." }, { status: 503 });
    const body = await request.json() as { model?: string };
    const model = runtime.source === "managed" && runtime.providerId !== "opencode"
      ? { id: runtime.model, name: runtime.providerId }
      : getOpenCodeModel(body.model);
    if (!model?.id) return Response.json({ error: "Choose a model from the OpenCode catalog or configure a managed provider." }, { status: 400 });
    const result = await requestOpenCode({
      model: model.id,
      apiKey,
      baseUrl: runtime.baseUrl,
      transport: runtime.transport,
      sessionId: `sorted-settings-test-${model.id}`,
      system: "Reply with exactly OK and nothing else.",
      prompt: "Connection test. Reply with exactly OK.",
      maxTokens: 16,
    });
    if (!result.ok) {
      if (result.errorMessage.includes("privacy settings") || result.errorMessage.includes("Global regions")) {
        return Response.json({ error: "OpenCode requires the workspace privacy region to be set to Global." }, { status: 502 });
      }
      const detail = safeOpenCodeFailureDetails([result.errorMessage || `OpenCode returned HTTP ${result.status} via its ${result.transport} endpoint.`], apiKey);
      return Response.json({ error: `The ${model.name} connection test failed.`, detail }, { status: 502 });
    }
    return Response.json({ ok: true, model: model.id, transport: result.transport, response: result.text.trim().slice(0, 40) });
  } catch (error) {
    console.error("AI connection test failed", error);
    return Response.json({ error: "The AI connection test failed." }, { status: 500 });
  }
}
