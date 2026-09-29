import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { adminUserControls, adminUsers, authSessions, authUsers } from "../../../../../db/schema";
import { isConfiguredAdminEmail, isAdminResponse, requireAdmin, writeAdminAudit } from "../../../../../lib/admin";

type UserAction = "suspend" | "restore" | "revoke-sessions" | "promote-admin" | "revoke-admin";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (isAdminResponse(admin)) return admin;
  const targetId = (await context.params).id;

  try {
    const body = await request.json() as { action?: UserAction; note?: string };
    const action = body.action;
    if (!action || !["suspend", "restore", "revoke-sessions", "promote-admin", "revoke-admin"].includes(action)) {
      return Response.json({ error: "Choose a valid user action." }, { status: 400 });
    }
    if (action === "suspend" && targetId === admin.user.id) return Response.json({ error: "You cannot suspend your own account." }, { status: 400 });
    if (action === "revoke-admin" && targetId === admin.user.id) return Response.json({ error: "You cannot remove your own administrator access." }, { status: 400 });

    const db = getDb();
    const [target] = await db.select({ id: authUsers.id, email: authUsers.email, name: authUsers.name }).from(authUsers).where(eq(authUsers.id, targetId)).limit(1);
    if (!target) return Response.json({ error: "User not found." }, { status: 404 });
    const now = new Date().toISOString();

    if (action === "suspend" || action === "restore") {
      await db.insert(adminUserControls).values({
        authUserId: targetId,
        suspended: action === "suspend",
        note: typeof body.note === "string" ? body.note.trim().slice(0, 500) : "",
        updatedBy: admin.user.id,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: adminUserControls.authUserId,
        set: {
          suspended: action === "suspend",
          note: typeof body.note === "string" ? body.note.trim().slice(0, 500) : "",
          updatedBy: admin.user.id,
          updatedAt: now,
        },
      });
    } else if (action === "revoke-sessions") {
      await db.delete(authSessions).where(eq(authSessions.userId, targetId));
    } else if (action === "promote-admin") {
      await db.insert(adminUsers).values({ authUserId: targetId, role: "admin", createdBy: admin.user.id, updatedAt: now }).onConflictDoUpdate({
        target: adminUsers.authUserId,
        set: { role: "admin", updatedAt: now },
      });
    } else if (action === "revoke-admin") {
      if (isConfiguredAdminEmail(target.email) || (env.SORTED_ADMIN_EMAILS ?? "").toLowerCase().includes(target.email.toLowerCase())) {
        return Response.json({ error: "This administrator is protected by SORTED_ADMIN_EMAILS. Remove the email from the deployment setting first." }, { status: 400 });
      }
      await db.delete(adminUsers).where(and(eq(adminUsers.authUserId, targetId), eq(adminUsers.role, "admin")));
    }

    const summaries: Record<UserAction, string> = {
      suspend: `Suspended ${target.email}.`,
      restore: `Restored ${target.email}.`,
      "revoke-sessions": `Revoked active sessions for ${target.email}.`,
      "promote-admin": `Granted administrator access to ${target.email}.`,
      "revoke-admin": `Removed administrator access from ${target.email}.`,
    };
    await writeAdminAudit({ actorId: admin.user.id, action, resourceType: "user", resourceId: targetId, summary: summaries[action], metadata: { email: target.email } });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Admin user action failed", error);
    return Response.json({ error: "The user action could not be completed." }, { status: 500 });
  }
}
