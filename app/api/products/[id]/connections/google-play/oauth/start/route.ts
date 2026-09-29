import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adminOAuthClients, googlePlayOAuthStates, productConnections, productOauthConnections, products } from "@/db/schema";
import { decryptAdminSecret } from "@/lib/admin-secrets";
import { buildGooglePlayAuthorizationUrl, createGooglePlayOAuthState, hashGooglePlayOAuthState } from "@/lib/google-play-oauth";
import { validateGooglePlayLocale, validateGooglePlayPackageName } from "@/lib/google-play";
import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";

const PROVIDER = "google-play";

function packageNameFromProductUrl(url: string) {
  try {
    return new URL(url).searchParams.get("id") ?? "";
  } catch {
    return "";
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    if (!Number.isSafeInteger(productId) || productId < 1) return Response.json({ error: "Product not found." }, { status: 404 });

    const db = getDb();
    const [product] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1);
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
    const [oauthConfig] = await db.select().from(adminOAuthClients).where(eq(adminOAuthClients.providerId, PROVIDER)).limit(1);
    if (!oauthConfig || !oauthConfig.enabled) return Response.json({ error: "Google Play connection is not enabled by a Sorted administrator yet." }, { status: 409 });

    const [serviceConnection] = await db.select().from(productConnections).where(and(eq(productConnections.productId, productId), eq(productConnections.ownerId, ownerId), eq(productConnections.provider, PROVIDER))).limit(1);
    const [oauthConnection] = await db.select().from(productOauthConnections).where(and(eq(productOauthConnections.productId, productId), eq(productOauthConnections.ownerId, ownerId), eq(productOauthConnections.provider, PROVIDER))).limit(1);
    const query = new URL(request.url).searchParams;
    const packageName = validateGooglePlayPackageName(query.get("packageName")?.trim() || oauthConnection?.packageName || serviceConnection?.packageName || packageNameFromProductUrl(product.url));
    const locale = validateGooglePlayLocale(query.get("locale")?.trim() || oauthConnection?.locale || serviceConnection?.locale || "en-US");
    const label = (query.get("label")?.trim() || oauthConnection?.label || serviceConnection?.label || "").slice(0, 120);
    const state = createGooglePlayOAuthState();
    const stateHash = await hashGooglePlayOAuthState(state);
    const now = new Date().toISOString();
    await db.insert(googlePlayOAuthStates).values({
      stateHash,
      productId,
      ownerId,
      packageName,
      locale,
      label,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt: now,
    });
    const clientSecret = await decryptAdminSecret(oauthConfig.clientSecretCiphertext);
    const redirectUri = new URL("/api/connections/google-play/callback", request.url).toString();
    const authorizationUrl = buildGooglePlayAuthorizationUrl({ clientId: oauthConfig.clientId, redirectUri, state });
    // Confirm the secret can be opened before sending the user to Google. The
    // secret itself is never included in the browser redirect.
    if (!clientSecret) return Response.json({ error: "Google Play OAuth is not configured correctly." }, { status: 500 });
    return Response.redirect(authorizationUrl, 302);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Google Play authorization could not be started." }, { status: 400 });
  }
}
