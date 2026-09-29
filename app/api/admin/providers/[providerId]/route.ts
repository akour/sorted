import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { adminProviderKeys } from "../../../../../db/schema";
import { isAdminResponse, requireAdmin, writeAdminAudit } from "../../../../../lib/admin";

export async function DELETE(_request: Request, context: { params: Promise<{ providerId: string }> }) {
  const admin = await requireAdmin();
  if (isAdminResponse(admin)) return admin;
  const providerId = (await context.params).providerId;
  try {
    const deleted = await getDb().delete(adminProviderKeys).where(eq(adminProviderKeys.providerId, providerId)).returning({ providerId: adminProviderKeys.providerId });
    if (!deleted.length) return Response.json({ error: "Provider configuration not found." }, { status: 404 });
    await writeAdminAudit({ actorId: admin.user.id, action: "remove-provider", resourceType: "provider", resourceId: providerId, summary: `Removed ${providerId} provider credentials.` });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Admin provider removal failed", error);
    return Response.json({ error: "The provider could not be removed." }, { status: 500 });
  }
}
