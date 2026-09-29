import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { adminProviderKeys } from "../../../../../../db/schema";
import { isAdminResponse, requireAdmin, writeAdminAudit } from "../../../../../../lib/admin";
import { decryptAdminSecret } from "../../../../../../lib/admin-secrets";
import { getAiProviderDefinition, testAiProvider } from "../../../../../../lib/ai-providers";

export async function POST(request: Request, context: { params: Promise<{ providerId: string }> }) {
  const admin = await requireAdmin();
  if (isAdminResponse(admin)) return admin;
  const providerId = (await context.params).providerId;
  try {
    const definition = getAiProviderDefinition(providerId);
    if (!definition) return Response.json({ error: "Provider is not supported." }, { status: 400 });
    const db = getDb();
    const [provider] = await db.select().from(adminProviderKeys).where(eq(adminProviderKeys.providerId, providerId)).limit(1);
    if (!provider) return Response.json({ error: "Save the provider before testing it." }, { status: 404 });
    const apiKey = await decryptAdminSecret(provider.apiKeyCiphertext);
    const body = await request.json().catch(() => ({})) as { model?: string };
    const model = body.model?.trim() || provider.model;
    if (definition.models?.length && !definition.models.some((option) => option.id === model)) {
      return Response.json({ error: "Choose a model from the selected provider's catalog." }, { status: 400 });
    }
    const result = await testAiProvider({ definition, apiKey, baseUrl: provider.baseUrl, model });
    const testedAt = new Date().toISOString();
    await db.update(adminProviderKeys).set({ lastTestedAt: testedAt, lastError: result.ok ? null : result.detail, updatedAt: testedAt }).where(eq(adminProviderKeys.providerId, providerId));
    await writeAdminAudit({ actorId: admin.user.id, action: result.ok ? "test-provider" : "provider-test-failed", resourceType: "provider", resourceId: providerId, summary: result.ok ? `Tested ${definition.name} successfully.` : `The ${definition.name} provider test failed.`, metadata: { status: result.status, model } });
    if (!result.ok) return Response.json({ ok: false, error: result.detail }, { status: 502 });
    return Response.json({ ok: true, detail: result.detail, testedAt });
  } catch (error) {
    console.error("Admin provider test failed", error);
    return Response.json({ ok: false, error: "The provider connection test failed." }, { status: 502 });
  }
}
