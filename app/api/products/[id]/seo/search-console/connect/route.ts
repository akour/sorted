import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adminOAuthClients, googleSearchConsoleOAuthStates, products } from "@/db/schema";
import { decryptAdminSecret } from "@/lib/admin-secrets";
import { buildGoogleSearchConsoleAuthorizationUrl, createGooglePlayOAuthState, hashGooglePlayOAuthState } from "@/lib/google-play-oauth";
import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";
import { classifyProductUrl } from "@/lib/product-url";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const productId = Number((await context.params).id);
    if (!Number.isSafeInteger(productId) || productId < 1) return Response.json({ error: "Product not found." }, { status: 404 });

    const db = getDb();
    const [product] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1);
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
    const websiteUrl = product.websiteUrl || (classifyProductUrl(product.url) === "website" ? product.url : "");
    if (!websiteUrl) return Response.json({ error: "Add a website destination to this product before connecting Search Console." }, { status: 400 });

    const [oauthConfig] = await db.select().from(adminOAuthClients).where(eq(adminOAuthClients.providerId, "google-play")).limit(1);
    if (!oauthConfig || !oauthConfig.enabled) return Response.json({ error: "Google account connections are not enabled by the Sorted administrator yet." }, { status: 409 });

    const state = createGooglePlayOAuthState();
    const now = new Date().toISOString();
    await db.insert(googleSearchConsoleOAuthStates).values({
      stateHash: await hashGooglePlayOAuthState(state), productId, ownerId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), createdAt: now,
    });
    const clientSecret = await decryptAdminSecret(oauthConfig.clientSecretCiphertext);
    if (!clientSecret) return Response.json({ error: "Google OAuth is not configured correctly." }, { status: 500 });
    const redirectUri = new URL("/api/connections/google-play/callback", request.url).toString();
    const authorizationUrl = buildGoogleSearchConsoleAuthorizationUrl({ clientId: oauthConfig.clientId, redirectUri, state });
    return Response.redirect(authorizationUrl, 302);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Search Console authorization could not be started." }, { status: 400 });
  }
}
