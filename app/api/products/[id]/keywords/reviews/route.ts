import { getDb } from "@/db";
import { adminOAuthClients, productConnections, productOauthConnections, products } from "@/db/schema";
import { decryptAdminSecret, decryptProductConnectionSecret } from "@/lib/admin-secrets";
import { getGooglePlayAccessToken, parseGooglePlayCredentials } from "@/lib/google-play";
import { fetchGooglePlayReviewLanguageWithAccessToken, googlePlayOAuthErrorMessage, refreshGooglePlayAccessToken } from "@/lib/google-play-oauth";
import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";
import { and, eq } from "drizzle-orm";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const productId = Number((await context.params).id);
  const ownerId = await getOwnerId();
  if (!ownerId) return ownerAuthenticationRequired();
  if (!Number.isSafeInteger(productId) || productId < 1) return Response.json({ error: "Product not found." }, { status: 404 });
  const db = getDb();
  const [[product], [oauthConnection], [serviceConnection]] = await Promise.all([
    db.select({ id: products.id }).from(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1),
    db.select().from(productOauthConnections).where(and(eq(productOauthConnections.productId, productId), eq(productOauthConnections.ownerId, ownerId), eq(productOauthConnections.provider, "google-play"))).limit(1),
    db.select().from(productConnections).where(and(eq(productConnections.productId, productId), eq(productConnections.ownerId, ownerId), eq(productConnections.provider, "google-play"))).limit(1),
  ]);
  if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
  if (!oauthConnection && !serviceConnection) return Response.json({ error: "Connect Google Play for this product before importing review language." }, { status: 409 });

  try {
    let accessToken = "";
    let packageName = "";
    let locale = "en-US";
    if (oauthConnection) {
      const [config] = await db.select().from(adminOAuthClients).where(eq(adminOAuthClients.providerId, "google-play")).limit(1);
      if (!config?.enabled) throw new Error("Google Play OAuth is not enabled by the administrator.");
      const stored = JSON.parse(await decryptProductConnectionSecret(oauthConnection.refreshTokenCiphertext)) as { refreshToken?: unknown };
      if (typeof stored.refreshToken !== "string" || !stored.refreshToken) throw new Error("The Google Play authorization is incomplete. Reconnect the account.");
      accessToken = await refreshGooglePlayAccessToken({ clientId: config.clientId, clientSecret: await decryptAdminSecret(config.clientSecretCiphertext), refreshToken: stored.refreshToken });
      packageName = oauthConnection.packageName;
      locale = oauthConnection.locale;
    } else if (serviceConnection) {
      accessToken = await getGooglePlayAccessToken(parseGooglePlayCredentials(await decryptProductConnectionSecret(serviceConnection.credentialsCiphertext)));
      packageName = serviceConnection.packageName;
      locale = serviceConnection.locale;
    }
    const reviews = await fetchGooglePlayReviewLanguageWithAccessToken(accessToken, packageName, locale);
    const now = new Date().toISOString();
    if (oauthConnection) await db.update(productOauthConnections).set({ status: "connected", lastError: null, lastSyncedAt: now, updatedAt: now }).where(eq(productOauthConnections.id, oauthConnection.id));
    if (serviceConnection) await db.update(productConnections).set({ status: "connected", lastError: null, lastSyncedAt: now, updatedAt: now }).where(eq(productConnections.id, serviceConnection.id));
    return Response.json({ reviews, fetchedAt: now });
  } catch (error) {
    const message = googlePlayOAuthErrorMessage(error);
    const now = new Date().toISOString();
    if (oauthConnection) await db.update(productOauthConnections).set({ status: "error", lastError: message, updatedAt: now }).where(eq(productOauthConnections.id, oauthConnection.id));
    if (serviceConnection) await db.update(productConnections).set({ status: "error", lastError: message, updatedAt: now }).where(eq(productConnections.id, serviceConnection.id));
    return Response.json({ error: message }, { status: 502 });
  }
}
