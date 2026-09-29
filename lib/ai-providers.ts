import { safeOpenCodeFailureDetails } from "@/lib/opencode-client";
import { OPENCODE_MODELS } from "@/lib/opencode-models";

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

function endpoint(baseUrl: string, path: string) {
  const root = baseUrl.replace(/\/$/, "").replace(/\/chat\/completions$/, "").replace(/\/messages$/, "");
  return `${root}/${path}`;
}

export async function testAiProvider(input: { definition: AiProviderDefinition; apiKey: string; baseUrl: string; model: string }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const url = endpoint(input.baseUrl, input.definition.kind === "anthropic" ? "messages" : "chat/completions");
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "Sorted/0.1 admin-provider-test" };
  let body: Record<string, unknown>;
  if (input.definition.kind === "anthropic") {
    headers["x-api-key"] = input.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    body = { model: input.model, max_tokens: 16, system: "Reply with exactly OK and nothing else.", messages: [{ role: "user", content: "Connection test. Reply with exactly OK." }] };
  } else {
    headers.authorization = `Bearer ${input.apiKey}`;
    if (input.definition.id === "opencode") {
      headers["x-opencode-session"] = `sorted-admin-provider-test-${crypto.randomUUID()}`;
    }
    body = { model: input.model, max_tokens: 16, temperature: 0, messages: [{ role: "system", content: "Reply with exactly OK and nothing else." }, { role: "user", content: "Connection test. Reply with exactly OK." }] };
  }
  try {
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
    const raw = await response.text();
    if (!response.ok) return { ok: false, status: response.status, detail: safeOpenCodeFailureDetails([raw || `Provider returned HTTP ${response.status}.`], input.apiKey) };
    return { ok: true, status: response.status, detail: "Provider responded successfully." };
  } catch (error) {
    return { ok: false, status: 0, detail: error instanceof Error && error.name === "AbortError" ? "The provider connection timed out." : "The provider connection failed." };
  } finally {
    clearTimeout(timeout);
  }
}
