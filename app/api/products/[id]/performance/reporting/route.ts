import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { adminOAuthClients, googlePlayReportingSnapshots, productConnections, productOauthConnections, products } from "../../../../../../db/schema";
import { decryptAdminSecret, decryptProductConnectionSecret } from "../../../../../../lib/admin-secrets";
import { getGooglePlayAccessToken, parseGooglePlayCredentials, validateGooglePlayPackageName } from "../../../../../../lib/google-play";
import { GOOGLE_PLAY_REPORTING_SCOPE, fetchGooglePlayQualitySnapshot, type GooglePlayQualitySnapshot } from "../../../../../../lib/google-play-reporting";
import { refreshGooglePlayAccessToken } from "../../../../../../lib/google-play-oauth";
import { getOwnerId, ownerAuthenticationRequired } from "../../../../../../lib/owner";

function safeSnapshot(row: typeof googlePlayReportingSnapshots.$inferSelect | undefined) {
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.dataJson) as GooglePlayQualitySnapshot;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function validProductId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = validProductId((await context.params).id);
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    if (!productId) return Response.json({ error: "Product not found." }, { status: 404 });
    const db = getDb();
    const [product] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1);
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
    const [oauthConnection] = await db.select({ id: productOauthConnections.id }).from(productOauthConnections).where(and(
      eq(productOauthConnections.productId, productId), eq(productOauthConnections.ownerId, ownerId), eq(productOauthConnections.provider, "google-play"),
    )).limit(1);
    const [serviceConnection] = await db.select({ id: productConnections.id }).from(productConnections).where(and(
      eq(productConnections.productId, productId), eq(productConnections.ownerId, ownerId), eq(productConnections.provider, "google-play"),
    )).limit(1);
    const [snapshot] = await db.select().from(googlePlayReportingSnapshots).where(and(
      eq(googlePlayReportingSnapshots.productId, productId), eq(googlePlayReportingSnapshots.ownerId, ownerId),
    )).limit(1);
    return Response.json({
      connected: Boolean(oauthConnection || serviceConnection),
      connectionType: oauthConnection ? "oauth" : serviceConnection ? "service-account" : null,
      snapshot: safeSnapshot(snapshot),
      lastError: snapshot?.lastError ?? null,
    });
  } catch {
    return Response.json({ error: "We could not load Google Play reporting status." }, { status: 500 });
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const productId = validProductId((await context.params).id);
  const ownerId = await getOwnerId();
  if (!ownerId) return ownerAuthenticationRequired();
  if (!productId) return Response.json({ error: "Product not found." }, { status: 404 });

  const db = getDb();
  const [product] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1);
  if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
  const [oauthConnection] = await db.select().from(productOauthConnections).where(and(
    eq(productOauthConnections.productId, productId), eq(productOauthConnections.ownerId, ownerId), eq(productOauthConnections.provider, "google-play"),
  )).limit(1);
  const [serviceConnection] = await db.select().from(productConnections).where(and(
    eq(productConnections.productId, productId), eq(productConnections.ownerId, ownerId), eq(productConnections.provider, "google-play"),
  )).limit(1);
  if (!oauthConnection && !serviceConnection) return Response.json({ error: "Connect Google Play for this product before syncing app quality data." }, { status: 409 });

  try {
    let packageName = validateGooglePlayPackageName(oauthConnection?.packageName ?? serviceConnection?.packageName ?? "");
    let accessToken = "";
    if (oauthConnection) {
      const [oauthConfig] = await db.select().from(adminOAuthClients).where(eq(adminOAuthClients.providerId, "google-play")).limit(1);
      if (!oauthConfig || !oauthConfig.enabled) throw new Error("Google Play OAuth is not enabled by the administrator.");
      const stored = JSON.parse(await decryptProductConnectionSecret(oauthConnection.refreshTokenCiphertext)) as { refreshToken?: unknown };
      if (typeof stored.refreshToken !== "string" || !stored.refreshToken) throw new Error("Reconnect the Google Play account to enable Reporting API access.");
      accessToken = await refreshGooglePlayAccessToken({
        clientId: oauthConfig.clientId,
        clientSecret: await decryptAdminSecret(oauthConfig.clientSecretCiphertext),
        refreshToken: stored.refreshToken,
      });
      packageName = validateGooglePlayPackageName(oauthConnection.packageName);
    } else if (serviceConnection) {
      const credentials = parseGooglePlayCredentials(await decryptProductConnectionSecret(serviceConnection.credentialsCiphertext));
      accessToken = await getGooglePlayAccessToken(credentials, GOOGLE_PLAY_REPORTING_SCOPE);
      packageName = validateGooglePlayPackageName(serviceConnection.packageName);
    }

    const snapshot = await fetchGooglePlayQualitySnapshot({ packageName, accessToken });
    const values = {
      productId,
      ownerId,
      packageName,
      dateStart: snapshot.dateStart,
      dateEnd: snapshot.dateEnd,
      dataJson: JSON.stringify(snapshot),
      syncedAt: snapshot.syncedAt,
      lastError: null,
    };
    await db.insert(googlePlayReportingSnapshots).values(values).onConflictDoUpdate({
      target: [googlePlayReportingSnapshots.productId, googlePlayReportingSnapshots.ownerId],
      set: {
        packageName: values.packageName,
        dateStart: values.dateStart,
        dateEnd: values.dateEnd,
        dataJson: values.dataJson,
        syncedAt: values.syncedAt,
        lastError: null,
      },
    });
    if (oauthConnection) await db.update(productOauthConnections).set({ status: "connected", lastError: null, updatedAt: snapshot.syncedAt }).where(eq(productOauthConnections.id, oauthConnection.id));
    return Response.json({ snapshot, rowCount: snapshot.rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Google Play reporting could not be synced.";
    const now = new Date().toISOString();
    const [existing] = await db.select({ id: googlePlayReportingSnapshots.id }).from(googlePlayReportingSnapshots).where(and(
      eq(googlePlayReportingSnapshots.productId, productId), eq(googlePlayReportingSnapshots.ownerId, ownerId),
    )).limit(1);
    if (existing) {
      await db.update(googlePlayReportingSnapshots).set({ lastError: message }).where(eq(googlePlayReportingSnapshots.id, existing.id));
    } else {
      const packageName = oauthConnection?.packageName ?? serviceConnection?.packageName ?? "";
      await db.insert(googlePlayReportingSnapshots).values({
        productId, ownerId, packageName, dateStart: "", dateEnd: "", dataJson: "{}", syncedAt: now, lastError: message,
      });
    }
    return Response.json({ error: message }, { status: 422 });
  }
}
