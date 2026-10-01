import { requestOpenCode, safeOpenCodeFailureDetails } from "@/lib/opencode-client";
import { getProviderModelTransport, OPENCODE_MODELS } from "@/lib/opencode-models";

export type AiProviderKind = "openai-compatible" | "anthropic";

export type AiProviderDefinition = {
  id: string;
  name: string;
  kind: AiProviderKind;
  defaultBaseUrl: string;
  defaultModel: string;
  description: string;
  models?: Array<{ id: string; name: string }>;
};

export const AI_PROVIDER_CATALOG: AiProviderDefinition[] = [
  { id: "opencode", name: "OpenCode", kind: "openai-compatible", defaultBaseUrl: "https://opencode.ai/zen/go/v1", defaultModel: "deepseek-v4.1-flash", models: OPENCODE_MODELS.map(({ id, name }) => ({ id, name })), description: "Current Sorted model gateway with the existing model catalog." },
  { id: "openai", name: "OpenAI", kind: "openai-compatible", defaultBaseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4.1-mini", description: "OpenAI’s direct API." },
  { id: "anthropic", name: "Anthropic", kind: "anthropic", defaultBaseUrl: "https://api.anthropic.com/v1", defaultModel: "claude-sonnet-4-5", description: "Anthropic’s Messages API." },
  { id: "google", name: "Google AI", kind: "openai-compatible", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", defaultModel: "gemini-2.5-flash", description: "Google’s OpenAI-compatible Gemini endpoint." },
  { id: "openrouter", name: "OpenRouter", kind: "openai-compatible", defaultBaseUrl: "https://openrouter.ai/api/v1", defaultModel: "openai/gpt-4.1-mini", description: "One key for multiple model families." },
  { id: "deepseek", name: "DeepSeek", kind: "openai-compatible", defaultBaseUrl: "https://api.deepseek.com/v1", defaultModel: "deepseek-chat", description: "DeepSeek’s OpenAI-compatible endpoint." },
  { id: "groq", name: "Groq", kind: "openai-compatible", defaultBaseUrl: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile", description: "Fast hosted open models." },
  { id: "mistral", name: "Mistral", kind: "openai-compatible", defaultBaseUrl: "https://api.mistral.ai/v1", defaultModel: "mistral-small-latest", description: "Mistral’s direct API." },
];

export function getAiProviderDefinition(providerId: string): AiProviderDefinition | undefined {
  return AI_PROVIDER_CATALOG.find((provider) => provider.id === providerId);
}

export async function testAiProvider(input: { definition: AiProviderDefinition; apiKey: string; baseUrl: string; model: string }) {
  const result = await requestOpenCode({
    model: input.model,
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    transport: getProviderModelTransport(input.definition.id, input.definition.kind, input.model),
    sessionId: `sorted-admin-provider-test-${crypto.randomUUID()}`,
    system: "Reply with exactly OK and nothing else.",
    prompt: "Connection test. Reply with exactly OK.",
    maxTokens: 16,
    timeoutMs: 20_000,
  });
  if (!result.ok) {
    return { ok: false, status: result.status, detail: safeOpenCodeFailureDetails([result.errorMessage || `Provider returned HTTP ${result.status || "unknown"}.`], input.apiKey) };
  }
  return { ok: true, status: result.status, detail: "Provider responded successfully." };
}
