import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { accountIdentityLinks } from "@/db/schema";
import { createAuth } from "@/lib/auth";
import { OWNER_ONLY_SITE_ORIGIN, isOwnerOnlySiteHost } from "@/lib/auth-hosts";
import { getTrustedSitesIdentity } from "@/lib/owner";

function forbidden(message: string): Response {
  return Response.json({ error: message }, { status: 403 });
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!isOwnerOnlySiteHost(url.hostname)) {
    return forbidden("Account linking is available only from the private owner preview.");
  }
  if (request.headers.get("origin") !== OWNER_ONLY_SITE_ORIGIN) {
    return forbidden("This account-link request is not from the private owner preview.");
  }

  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.trim().length < 32 || !env.DB) {
    return Response.json({ error: "Account sign-in is not configured on this deployment." }, { status: 503 });
  }

  const siteIdentity = await getTrustedSitesIdentity();
  if (!siteIdentity) {
    return forbidden("The private preview identity could not be verified.");
  }
  const siteUserId = siteIdentity.userId;

  try {
    const session = await createAuth(url.hostname).api.getSession({ headers: request.headers });
    if (!session) return Response.json({ error: "Sign in to your Sorted account first." }, { status: 401 });

    const authEmail = session.user.email.trim().toLowerCase();
    if (!authEmail) return forbidden("Your Sorted account needs an email address before it can be connected.");

    const db = getDb();
    const [byAuthUser, bySiteUser] = await Promise.all([
      db.select().from(accountIdentityLinks).where(eq(accountIdentityLinks.authUserId, session.user.id)).limit(1),
      db.select().from(accountIdentityLinks).where(eq(accountIdentityLinks.siteUserId, siteUserId)).limit(1),
    ]);
    const existingAuthLink = byAuthUser[0];
    const existingSiteLink = bySiteUser[0];

    if (
      (existingAuthLink && existingAuthLink.siteUserId !== siteUserId) ||
      (existingSiteLink && existingSiteLink.authUserId !== session.user.id)
    ) {
      return Response.json({ error: "This Sorted account or preview identity is already linked to a different account." }, { status: 409 });
    }

    if (!existingAuthLink && !existingSiteLink) {
      await db.insert(accountIdentityLinks).values({
        authUserId: session.user.id,
        siteUserId,
        email: authEmail,
      }).onConflictDoNothing();
    }

    const [confirmedLink] = await db
      .select()
      .from(accountIdentityLinks)
      .where(eq(accountIdentityLinks.authUserId, session.user.id))
      .limit(1);

    if (!confirmedLink || confirmedLink.siteUserId !== siteUserId) {
      return Response.json({ error: "This account could not be linked because the identity is already in use." }, { status: 409 });
    }

    // The owner-only Sites session authorizes the workspace link. The Sorted
    // account's email remains unverified until its own verification link is used.
    return Response.json({
      linked: true,
      alreadyLinked: Boolean(existingAuthLink && existingSiteLink),
      emailVerified: session.user.emailVerified,
    });
  } catch {
    return Response.json({ error: "Could not link this account right now." }, { status: 500 });
  }
}
