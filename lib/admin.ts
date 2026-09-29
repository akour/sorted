import { headers } from "next/headers";
import { env } from "cloudflare:workers";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adminAuditLog, adminUserControls, adminUsers } from "@/db/schema";
import { createAuth } from "@/lib/auth";
import { isCustomerAuthHost, isOwnerOnlySiteHost, normalizeHost } from "@/lib/auth-hosts";

const SITES_USER_ID_HEADER = "oai-authenticated-user-id";
const SITES_USER_EMAIL_HEADER = "oai-authenticated-user-email";

export type AdminContext = {
  user: { id: string; email: string; name: string };
  host: string;
  viaEnvironment: boolean;
  isAdmin: boolean;
};

function configuredAdminEmails(): Set<string> {
  return new Set((env.SORTED_ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
}

export function isConfiguredAdminEmail(email: string): boolean {
  return configuredAdminEmails().has(email.trim().toLowerCase());
}

export async function getAdminContext(): Promise<AdminContext | null> {
  const requestHeaders = await headers();
  const host = normalizeHost(requestHeaders.get("host"));
  let user: AdminContext["user"] | null = null;
  let viaEnvironment = false;

  if (isOwnerOnlySiteHost(host)) {
    const id = requestHeaders.get(SITES_USER_ID_HEADER)?.trim();
    const email = requestHeaders.get(SITES_USER_EMAIL_HEADER)?.trim().toLowerCase() ?? "";
    if (id && email) {
      user = { id, email, name: email };
      viaEnvironment = isConfiguredAdminEmail(email);
    }
  } else if (isCustomerAuthHost(host)) {
    try {
      const session = await createAuth(host).api.getSession({ headers: requestHeaders });
      if (session?.user) {
        if (await isSuspendedAuthUser(session.user.id)) return null;
        user = {
          id: session.user.id,
          email: session.user.email.trim().toLowerCase(),
          name: session.user.name?.trim() || session.user.email.trim(),
        };
        viaEnvironment = isConfiguredAdminEmail(user.email);
      }
    } catch {
      return null;
    }
  }

  if (!user) return null;

  let databaseAdmin = false;
  try {
    const [record] = await getDb().select({ role: adminUsers.role }).from(adminUsers).where(eq(adminUsers.authUserId, user.id)).limit(1);
    databaseAdmin = record?.role === "admin";
  } catch {
    // Before the admin migration is applied, the environment allowlist remains
    // the safe bootstrap path.
  }

  return { user, host, viaEnvironment, isAdmin: viaEnvironment || databaseAdmin };
}

export async function requireAdmin(): Promise<AdminContext | Response> {
  const context = await getAdminContext();
  if (!context) return Response.json({ error: "Sign in with an administrator account to continue." }, { status: 401 });
  if (!context.isAdmin) return Response.json({ error: "This area is restricted to Sorted administrators." }, { status: 403 });
  return context;
}

export async function isSuspendedAuthUser(authUserId: string): Promise<boolean> {
  try {
    const [control] = await getDb().select({ suspended: adminUserControls.suspended })
      .from(adminUserControls).where(eq(adminUserControls.authUserId, authUserId)).limit(1);
    return control?.suspended === true;
  } catch {
    return false;
  }
}

export async function writeAdminAudit(input: {
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  await getDb().insert(adminAuditLog).values({
    id: crypto.randomUUID(),
    actorId: input.actorId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? "",
    summary: input.summary,
    metadata: JSON.stringify(input.metadata ?? {}),
  });
}

export async function listAdminAudit(limit = 20) {
  const rows = await getDb().select().from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt)).limit(Math.min(Math.max(limit, 1), 100));
  return rows.map((row) => ({ ...row, metadata: parseMetadata(row.metadata) }));
}

function parseMetadata(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function isAdminResponse(value: AdminContext | Response): value is Response {
  return value instanceof Response;
}
