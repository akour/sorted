import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accountIdentityLinks } from "@/db/schema";
import { createAuth } from "./auth";
import { isSuspendedAuthUser } from "./admin";
import { isCustomerAuthHost, isOwnerOnlySiteHost, normalizeHost } from "./auth-hosts";

const USER_ID_HEADER = "oai-authenticated-user-id";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";

export type TrustedSitesIdentity = {
  userId: string;
  email: string | null;
};

export async function getTrustedSitesIdentity(): Promise<TrustedSitesIdentity | null> {
  const requestHeaders = await headers();
  if (!isOwnerOnlySiteHost(normalizeHost(requestHeaders.get("host")))) return null;

  const userId = requestHeaders.get(USER_ID_HEADER)?.trim();
  if (!userId) return null;

  return {
    userId,
    email: requestHeaders.get(USER_EMAIL_HEADER)?.trim().toLowerCase() || null,
  };
}

/**
 * Keeps the existing Sites identity as the canonical owner ID on the private
 * preview. Customer hosts resolve a Better Auth session to either a linked
 * legacy owner ID or a new, isolated account ID.
 */
export async function getOwnerId(): Promise<string | null> {
  const requestHeaders = await headers();
  const host = normalizeHost(requestHeaders.get("host"));
  if (isOwnerOnlySiteHost(host)) {
    const value = requestHeaders.get(USER_ID_HEADER)?.trim();
    return value || null;
  }
  if (!isCustomerAuthHost(host)) return null;

  try {
    const session = await createAuth(host).api.getSession({ headers: requestHeaders });
    if (!session) return null;
    if (await isSuspendedAuthUser(session.user.id)) return null;

    const [linkedIdentity] = await getDb()
      .select({ siteUserId: accountIdentityLinks.siteUserId })
      .from(accountIdentityLinks)
      .where(eq(accountIdentityLinks.authUserId, session.user.id))
      .limit(1);

    return linkedIdentity?.siteUserId ?? `auth:${session.user.id}`;
  } catch {
    return null;
  }
}

export function ownerAuthenticationRequired(): Response {
  return Response.json({ error: "Sign in to continue." }, { status: 401 });
}
