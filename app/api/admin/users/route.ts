import { desc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { accountIdentityLinks, adminUserControls, adminUsers, authSessions, authUsers, products } from "../../../../db/schema";
import { isConfiguredAdminEmail, isAdminResponse, requireAdmin } from "../../../../lib/admin";

export async function GET() {
  const admin = await requireAdmin();
  if (isAdminResponse(admin)) return admin;

  try {
    const db = getDb();
    const [users, controls, databaseAdmins, identities, sessions, productsRows] = await Promise.all([
      db.select().from(authUsers).orderBy(desc(authUsers.createdAt)),
      db.select().from(adminUserControls),
      db.select().from(adminUsers),
      db.select().from(accountIdentityLinks),
      db.select({ userId: authSessions.userId }).from(authSessions),
      db.select({ ownerId: products.ownerId }).from(products),
    ]);
    const controlByUser = new Map(controls.map((row) => [row.authUserId, row]));
    const identityByUser = new Map(identities.map((row) => [row.authUserId, row.siteUserId]));
    const adminIds = new Set(databaseAdmins.filter((row) => row.role === "admin").map((row) => row.authUserId));
    const sessionsByUser = new Map<string, number>();
    for (const session of sessions) sessionsByUser.set(session.userId, (sessionsByUser.get(session.userId) ?? 0) + 1);
    const productsByOwner = new Map<string, number>();
    for (const product of productsRows) productsByOwner.set(product.ownerId, (productsByOwner.get(product.ownerId) ?? 0) + 1);

    const safeUsers = users.map((user) => {
      const control = controlByUser.get(user.id);
      const linkedOwner = identityByUser.get(user.id);
      const productCount = (productsByOwner.get(`auth:${user.id}`) ?? 0) + (linkedOwner ? productsByOwner.get(linkedOwner) ?? 0 : 0);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        suspended: control?.suspended === true,
        isAdmin: isConfiguredAdminEmail(user.email) || adminIds.has(user.id),
        isEnvironmentAdmin: isConfiguredAdminEmail(user.email),
        sessionCount: sessionsByUser.get(user.id) ?? 0,
        productCount,
      };
    });
    return Response.json({
      users: safeUsers,
      summary: {
        total: safeUsers.length,
        verified: safeUsers.filter((user) => user.emailVerified).length,
        suspended: safeUsers.filter((user) => user.suspended).length,
        admins: safeUsers.filter((user) => user.isAdmin).length,
      },
    });
  } catch (error) {
    console.error("Admin users load failed", error);
    return Response.json({ error: "Could not load user management." }, { status: 500 });
  }
}
