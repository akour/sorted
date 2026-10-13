import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adminOAuthClients, googleSearchConsoleConnections } from "@/db/schema";
import { decryptAdminSecret, decryptProductConnectionSecret } from "@/lib/admin-secrets";
import { refreshGoogleOAuthAccessToken } from "@/lib/google-play-oauth";

export async function getGoogleSearchConsoleAccess(ownerId: string): Promise<{ accessToken: string; accountEmail: string }> {
  const db = getDb();
  const [connection] = await db.select().from(googleSearchConsoleConnections).where(eq(googleSearchConsoleConnections.ownerId, ownerId)).limit(1);
  if (!connection || connection.status !== "connected") throw new Error("Connect a Google account to Search Console first.");

  const [oauthConfig] = await db.select().from(adminOAuthClients).where(eq(adminOAuthClients.providerId, "google-play")).limit(1);
  if (!oauthConfig || !oauthConfig.enabled) throw new Error("Google OAuth is currently disabled by the Sorted administrator.");

  try {
    const stored = JSON.parse(await decryptProductConnectionSecret(connection.refreshTokenCiphertext)) as { refreshToken?: unknown };
    const refreshToken = typeof stored.refreshToken === "string" ? stored.refreshToken : "";
    if (!refreshToken) throw new Error("Stored Google authorization is incomplete. Reconnect Search Console.");
    const accessToken = await refreshGoogleOAuthAccessToken({
      clientId: oauthConfig.clientId,
      clientSecret: await decryptAdminSecret(oauthConfig.clientSecretCiphertext),
      refreshToken,
    });
    return { accessToken, accountEmail: connection.accountEmail };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Google authorization needs to be renewed.";
    await db.update(googleSearchConsoleConnections).set({ status: "reauthorize", lastError: detail.slice(0, 240), updatedAt: new Date().toISOString() }).where(eq(googleSearchConsoleConnections.ownerId, ownerId));
    throw new Error("Google Search Console needs to be reconnected. Connect the Google account again to continue.");
  }
}
