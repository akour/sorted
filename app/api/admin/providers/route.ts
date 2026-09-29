import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { adminProviderKeys } from "../../../../db/schema";
import { encryptAdminSecret, secretHint } from "../../../../lib/admin-secrets";
import { isAdminResponse, requireAdmin, writeAdminAudit } from "../../../../lib/admin";
import { AI_PROVIDER_CATALOG, getAiProviderDefinition } from "../../../../lib/ai-providers";

function safeProvider(row: typeof adminProviderKeys.$inferSelect) {
  return {
    providerId: row.providerId,
    label: row.label,
    baseUrl: row.baseUrl,
    model: row.model,
    enabled: row.enabled,
    apiKeyHint: row.apiKeyHint,
    lastTestedAt: row.lastTestedAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizedUrl(value: string, fallback: string) {
  const candidate = (value.trim() || fallback).replace(/\/+$/, "");
  try {
    const parsed = new URL(candidate);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export async function GET() {
  const admin = await requireAdmin();
  if (isAdminResponse(admin)) return admin;
  try {
    const providers = await getDb().select().from(adminProviderKeys);
    return Response.json({ catalog: AI_PROVIDER_CATALOG, providers: providers.map(safeProvider) });
  } catch (error) {
    console.error("Admin provider load failed", error);
    return Response.json({ error: "Could not load AI provider settings." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (isAdminResponse(admin)) return admin;

  try {
    const body = await request.json() as { providerId?: string; label?: string; baseUrl?: string; model?: string; apiKey?: string; enabled?: boolean };
    const providerId = body.providerId?.trim() ?? "";
    const definition = getAiProviderDefinition(providerId);
    if (!definition) return Response.json({ error: "Choose a supported AI provider." }, { status: 400 });
    const baseUrl = normalizedUrl(body.baseUrl ?? "", definition.defaultBaseUrl);
    if (!baseUrl) return Response.json({ error: "Enter a valid provider URL." }, { status: 400 });
    const label = body.label?.trim().slice(0, 80) || definition.name;
    const model = body.model?.trim().slice(0, 160) || definition.defaultModel;
    const db = getDb();
    const [existing] = await db.select().from(adminProviderKeys).where(eq(adminProviderKeys.providerId, providerId)).limit(1);
    const apiKey = body.apiKey?.trim() ?? "";
    if (!existing && !apiKey) return Response.json({ error: "Enter an API key for a new provider." }, { status: 400 });
    const encryptedKey = apiKey ? await encryptAdminSecret(apiKey) : existing?.apiKeyCiphertext;
    if (!encryptedKey) return Response.json({ error: "The provider key could not be protected." }, { status: 500 });
    const now = new Date().toISOString();
    const values = {
      providerId,
      label,
      baseUrl,
      model,
      apiKeyCiphertext: encryptedKey,
      apiKeyHint: apiKey ? secretHint(apiKey) : existing?.apiKeyHint ?? "••••",
      enabled: body.enabled ?? existing?.enabled ?? true,
      lastTestedAt: apiKey ? null : existing?.lastTestedAt ?? null,
      lastError: apiKey ? null : existing?.lastError ?? null,
      createdBy: existing?.createdBy ?? admin.user.id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const [saved] = await db.insert(adminProviderKeys).values(values).onConflictDoUpdate({
      target: adminProviderKeys.providerId,
      set: {
        label: values.label,
        baseUrl: values.baseUrl,
        model: values.model,
        apiKeyCiphertext: values.apiKeyCiphertext,
        apiKeyHint: values.apiKeyHint,
        enabled: values.enabled,
        lastTestedAt: values.lastTestedAt,
        lastError: values.lastError,
        updatedAt: values.updatedAt,
      },
    }).returning();
    await writeAdminAudit({ actorId: admin.user.id, action: "save-provider", resourceType: "provider", resourceId: providerId, summary: `Saved ${definition.name} provider credentials.`, metadata: { enabled: values.enabled, keyRotated: Boolean(apiKey) } });
    return Response.json({ provider: safeProvider(saved) });
  } catch (error) {
    console.error("Admin provider save failed", error);
    return Response.json({ error: "The AI provider could not be saved." }, { status: 500 });
  }
}
