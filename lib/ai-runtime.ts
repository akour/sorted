import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adminProviderKeys } from "@/db/schema";
import { decryptAdminSecret } from "@/lib/admin-secrets";
import { getAiProviderDefinition } from "@/lib/ai-providers";
import { DEFAULT_OPENCODE_MODEL, getProviderRuntimeTransport, type OpenCodeTransport } from "@/lib/opencode-models";

export type OpenCodeRuntime = {
  apiKey: string;
  baseUrl: string | undefined;
  providerId: string;
  model: string | undefined;
  fallbackModels: string[];
  transport: OpenCodeTransport | undefined;
  source: "managed" | "environment" | "none";
};

function parseFallbackModels(value: string | undefined) {
  try {
    const parsed = JSON.parse(value ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((model): model is string => typeof model === "string" && Boolean(model.trim())) : [];
  } catch {
    return [];
  }
}

export async function getOpenCodeRuntime(): Promise<OpenCodeRuntime> {
  try {
    const db = getDb();
    const [preferred] = await db.select().from(adminProviderKeys)
      .where(eq(adminProviderKeys.providerId, "opencode")).limit(1);
    const [managed] = preferred?.enabled
      ? [preferred]
      : await db.select().from(adminProviderKeys).where(eq(adminProviderKeys.enabled, true)).orderBy(desc(adminProviderKeys.updatedAt)).limit(1);
    if (managed?.enabled && managed.apiKeyCiphertext) {
      const apiKey = await decryptAdminSecret(managed.apiKeyCiphertext);
      if (apiKey) {
        const definition = getAiProviderDefinition(managed.providerId);
        return {
          apiKey,
          baseUrl: managed.baseUrl || env.OPENCODE_BASE_URL,
          providerId: managed.providerId,
          model: managed.model || definition?.defaultModel,
          fallbackModels: parseFallbackModels(managed.fallbackModels),
          transport: getProviderRuntimeTransport(managed.providerId, definition?.kind ?? "openai-compatible"),
          source: "managed",
        };
      }
    }
  } catch {
    // Fall back to the deployment secret while the admin migration or key is
    // unavailable. This keeps existing deployments backward compatible.
  }

  const apiKey = env.OPENCODE_API_KEY?.trim() ?? "";
  return apiKey
    ? { apiKey, baseUrl: env.OPENCODE_BASE_URL, providerId: "opencode", model: env.OPENCODE_MODEL || DEFAULT_OPENCODE_MODEL, fallbackModels: [], transport: undefined, source: "environment" }
    : { apiKey: "", baseUrl: env.OPENCODE_BASE_URL, providerId: "opencode", model: env.OPENCODE_MODEL || DEFAULT_OPENCODE_MODEL, fallbackModels: [], transport: undefined, source: "none" };
}

export function getGenerationModels(runtime: OpenCodeRuntime) {
  return [runtime.model, ...runtime.fallbackModels].filter((model, index, list): model is string => Boolean(model) && list.indexOf(model) === index);
}
