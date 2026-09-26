import { headers } from "next/headers";

const OWNER_ONLY_SITE_HOST = "sorted-workspace.akourx2.chatgpt.site";

/**
 * Resolves the current account only on the owner-only Sites hostname. The
 * eventual customer-facing hostname must use a real app session, never a
 * caller-supplied Sites identity header.
 */
export async function getOwnerId(): Promise<string | null> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host")?.split(":", 1)[0]?.toLowerCase();
  if (host !== OWNER_ONLY_SITE_HOST) return null;

  const value = requestHeaders.get("oai-authenticated-user-id")?.trim();
  return value || null;
}

export function ownerAuthenticationRequired(): Response {
  return Response.json({ error: "Sign in to continue." }, { status: 401 });
}
