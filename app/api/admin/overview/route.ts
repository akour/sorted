import { env } from "cloudflare:workers";
import { count, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { adminProviderKeys, authUsers, products } from "../../../../db/schema";
import { getOpenCodeRuntime } from "../../../../lib/ai-runtime";
import { isAdminResponse, listAdminAudit, requireAdmin } from "../../../../lib/admin";

export async function GET() {
  const admin = await requireAdmin();
  if (isAdminResponse(admin)) return admin;

  try {
    const db = getDb();
    const [[userCount], [verifiedCount], [productCount], [providerCount]] = await Promise.all([
      db.select({ value: count() }).from(authUsers),
      db.select({ value: count() }).from(authUsers).where(eq(authUsers.emailVerified, true)),
      db.select({ value: count() }).from(products),
      db.select({ value: count() }).from(adminProviderKeys).where(eq(adminProviderKeys.enabled, true)),
    ]);
    const runtime = await getOpenCodeRuntime();

    return Response.json({
      counts: {
        users: userCount?.value ?? 0,
        verifiedUsers: verifiedCount?.value ?? 0,
        products: productCount?.value ?? 0,
        configuredProviders: providerCount?.value ?? 0,
      },
      readiness: {
        betterAuthSecret: Boolean(env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET.length >= 32),
        d1: Boolean(env.DB),
        resend: Boolean(env.RESEND_API_KEY && env.SORTED_AUTH_EMAIL_FROM && env.SORTED_AUTH_EMAIL_ENABLED === "true"),
        openCode: Boolean(runtime.apiKey),
        adminAllowlist: Boolean(env.SORTED_ADMIN_EMAILS?.trim()),
      },
      runtime: { source: runtime.source, providerId: runtime.providerId, model: runtime.model ?? null, baseUrl: runtime.baseUrl ?? null },
      currentAdmin: { id: admin.user.id, email: admin.user.email, name: admin.user.name },
      audit: await listAdminAudit(12),
    });
  } catch (error) {
    console.error("Admin overview failed", error);
    return Response.json({ error: "Could not load the admin overview." }, { status: 500 });
  }
}
