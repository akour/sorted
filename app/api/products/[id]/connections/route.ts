import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { productConnections, productOauthConnections, products } from "../../../../../db/schema";
import { decryptProductConnectionSecret, encryptProductConnectionSecret, secretHint } from "../../../../../lib/admin-secrets";
import { googlePlayErrorMessage, parseGooglePlayCredentials, testGooglePlayConnection, validateGooglePlayLocale, validateGooglePlayPackageName } from "../../../../../lib/google-play";
import { revokeGooglePlayRefreshToken } from "../../../../../lib/google-play-oauth";
import { getOwnerId, ownerAuthenticationRequired } from "../../../../../lib/owner";

const GOOGLE_PLAY_PROVIDER = "google-play";

function safeConnection(connection: typeof productConnections.$inferSelect | undefined) {
  if (!connection) return null;
  return {
    id: connection.id,
    provider: connection.provider,
    packageName: connection.packageName,
    locale: connection.locale,
    label: connection.label,
    credentialHint: connection.credentialHint,
    status: connection.status,
    lastTestedAt: connection.lastTestedAt,
    lastSyncedAt: connection.lastSyncedAt,
    lastError: connection.lastError,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

function safeOauthConnection(connection: typeof productOauthConnections.$inferSelect | undefined) {
  if (!connection) return null;
  return {
    id: connection.id,
    provider: connection.provider,
    packageName: connection.packageName,
    locale: connection.locale,
    label: connection.label,
    accountEmail: connection.accountEmail,
    refreshTokenHint: connection.refreshTokenHint,
    status: connection.status,
    lastSyncedAt: connection.lastSyncedAt,
    lastError: connection.lastError,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

async function loadProduct(productId: number, ownerId: string) {
  const [product] = await getDb().select().from(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1);
  return product;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    if (!Number.isSafeInteger(productId) || productId < 1) return Response.json({ error: "Product not found." }, { status: 404 });
    const product = await loadProduct(productId, ownerId);
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
    const [connection] = await getDb().select().from(productConnections).where(and(eq(productConnections.productId, productId), eq(productConnections.ownerId, ownerId), eq(productConnections.provider, GOOGLE_PLAY_PROVIDER))).limit(1);
    const [oauthConnection] = await getDb().select().from(productOauthConnections).where(and(eq(productOauthConnections.productId, productId), eq(productOauthConnections.ownerId, ownerId), eq(productOauthConnections.provider, GOOGLE_PLAY_PROVIDER))).limit(1);
    return Response.json({ connection: safeConnection(connection), oauthConnection: safeOauthConnection(oauthConnection) });
  } catch {
    return Response.json({ error: "We could not load the product connections." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    if (!Number.isSafeInteger(productId) || productId < 1) return Response.json({ error: "Product not found." }, { status: 404 });
    const product = await loadProduct(productId, ownerId);
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
    const payload = await request.json().catch(() => ({})) as { provider?: unknown; packageName?: unknown; locale?: unknown; label?: unknown; serviceAccountJson?: unknown };
    if (payload.provider !== GOOGLE_PLAY_PROVIDER) return Response.json({ error: "Google Play is the only product connection available right now." }, { status: 400 });
    const packageName = validateGooglePlayPackageName(typeof payload.packageName === "string" ? payload.packageName : "");
    const locale = validateGooglePlayLocale(typeof payload.locale === "string" ? payload.locale : "en-US");
    const label = typeof payload.label === "string" ? payload.label.trim().slice(0, 120) : "";
    const db = getDb();
    const [existing] = await db.select().from(productConnections).where(and(eq(productConnections.productId, productId), eq(productConnections.ownerId, ownerId), eq(productConnections.provider, GOOGLE_PLAY_PROVIDER))).limit(1);
    const rawCredentials = typeof payload.serviceAccountJson === "string" ? payload.serviceAccountJson.trim() : "";
    let credentials;
    let encryptedCredentials = existing?.credentialsCiphertext ?? "";
    let credentialHint = existing?.credentialHint ?? "";
    if (rawCredentials) {
      credentials = parseGooglePlayCredentials(rawCredentials);
      encryptedCredentials = await encryptProductConnectionSecret(JSON.stringify(credentials));
      credentialHint = secretHint(credentials.client_email);
    } else if (existing) {
      credentials = parseGooglePlayCredentials(await decryptProductConnectionSecret(existing.credentialsCiphertext));
    } else {
      return Response.json({ error: "Paste the Google service-account JSON key to create this connection." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const baseValues = {
      productId,
      ownerId,
      provider: GOOGLE_PLAY_PROVIDER,
      packageName,
      locale,
      label,
      credentialsCiphertext: encryptedCredentials,
      credentialHint,
      status: "testing",
      lastTestedAt: now,
      lastError: null,
      updatedAt: now,
    };
    const [connection] = existing
      ? await db.update(productConnections).set(baseValues).where(eq(productConnections.id, existing.id)).returning()
      : await db.insert(productConnections).values(baseValues).returning();

    try {
      await testGooglePlayConnection(credentials, packageName);
      const [testedConnection] = await db.update(productConnections).set({ status: "connected", lastError: null, lastTestedAt: now, updatedAt: new Date().toISOString() }).where(eq(productConnections.id, connection.id)).returning();
      return Response.json({ connection: safeConnection(testedConnection), message: "Google Play is connected. Sync the authenticated listing when you are ready." });
    } catch (error) {
      const message = googlePlayErrorMessage(error);
      const [failedConnection] = await db.update(productConnections).set({ status: "error", lastError: message, updatedAt: new Date().toISOString() }).where(eq(productConnections.id, connection.id)).returning();
      return Response.json({ connection: safeConnection(failedConnection), error: message }, { status: 422 });
    }
  } catch (error) {
    const message = googlePlayErrorMessage(error);
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    if (!Number.isSafeInteger(productId) || productId < 1) return Response.json({ error: "Product not found." }, { status: 404 });
    const product = await loadProduct(productId, ownerId);
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
    const db = getDb();
    const [oauthConnection] = await db.select().from(productOauthConnections).where(and(eq(productOauthConnections.productId, productId), eq(productOauthConnections.ownerId, ownerId), eq(productOauthConnections.provider, GOOGLE_PLAY_PROVIDER))).limit(1);
    if (oauthConnection) {
      try {
        const parsed = JSON.parse(await decryptProductConnectionSecret(oauthConnection.refreshTokenCiphertext)) as { refreshToken?: unknown };
        if (typeof parsed.refreshToken === "string" && parsed.refreshToken) await revokeGooglePlayRefreshToken(parsed.refreshToken);
      } catch {
        // Revocation is best-effort; deletion still removes Sorted's copy.
      }
    }
    await db.delete(productConnections).where(and(eq(productConnections.productId, productId), eq(productConnections.ownerId, ownerId), eq(productConnections.provider, GOOGLE_PLAY_PROVIDER)));
    await db.delete(productOauthConnections).where(and(eq(productOauthConnections.productId, productId), eq(productOauthConnections.ownerId, ownerId), eq(productOauthConnections.provider, GOOGLE_PLAY_PROVIDER)));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "We could not disconnect Google Play." }, { status: 500 });
  }
}
