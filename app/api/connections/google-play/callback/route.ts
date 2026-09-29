import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adminOAuthClients, googlePlayOAuthStates, productOauthConnections } from "@/db/schema";
import { decryptAdminSecret, encryptProductConnectionSecret, secretHint } from "@/lib/admin-secrets";
import { exchangeGooglePlayAuthorizationCode, hashGooglePlayOAuthState } from "@/lib/google-play-oauth";

const PROVIDER = "google-play";

function workspaceRedirect(request: Request, input: { productId?: number; result: "connected" | "cancelled" | "error" }) {
  const url = new URL("/workspace", request.url);
  if (input.productId) url.searchParams.set("productId", String(input.productId));
  url.searchParams.set("googlePlay", input.result);
  return Response.redirect(url, 303);
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const state = query.get("state")?.trim() ?? "";
  if (!state) return workspaceRedirect(request, { result: "error" });

  try {
    const stateHash = await hashGooglePlayOAuthState(state);
    const db = getDb();
    const [oauthState] = await db.select().from(googlePlayOAuthStates).where(eq(googlePlayOAuthStates.stateHash, stateHash)).limit(1);
    if (!oauthState || oauthState.usedAt || new Date(oauthState.expiresAt).getTime() < Date.now()) return workspaceRedirect(request, { result: "error" });
    await db.update(googlePlayOAuthStates).set({ usedAt: new Date().toISOString() }).where(eq(googlePlayOAuthStates.stateHash, stateHash));

    if (query.get("error")) return workspaceRedirect(request, { productId: oauthState.productId, result: "cancelled" });
    const code = query.get("code")?.trim() ?? "";
    if (!code) return workspaceRedirect(request, { productId: oauthState.productId, result: "error" });

    const [oauthConfig] = await db.select().from(adminOAuthClients).where(eq(adminOAuthClients.providerId, PROVIDER)).limit(1);
    if (!oauthConfig || !oauthConfig.enabled) return workspaceRedirect(request, { productId: oauthState.productId, result: "error" });
    const clientSecret = await decryptAdminSecret(oauthConfig.clientSecretCiphertext);
    const redirectUri = new URL("/api/connections/google-play/callback", request.url).toString();
    const tokens = await exchangeGooglePlayAuthorizationCode({ code, clientId: oauthConfig.clientId, clientSecret, redirectUri });
    const encryptedRefreshToken = await encryptProductConnectionSecret(JSON.stringify({ refreshToken: tokens.refreshToken }));
    const now = new Date().toISOString();
    const [existing] = await db.select().from(productOauthConnections).where(and(eq(productOauthConnections.productId, oauthState.productId), eq(productOauthConnections.ownerId, oauthState.ownerId), eq(productOauthConnections.provider, PROVIDER))).limit(1);
    const values = {
      productId: oauthState.productId,
      ownerId: oauthState.ownerId,
      provider: PROVIDER,
      packageName: oauthState.packageName,
      locale: oauthState.locale,
      label: oauthState.label,
      accountEmail: tokens.accountEmail || existing?.accountEmail || "",
      refreshTokenCiphertext: encryptedRefreshToken,
      refreshTokenHint: secretHint(tokens.refreshToken),
      status: "connected",
      lastError: null,
      updatedAt: now,
      createdAt: existing?.createdAt ?? now,
    };
    await db.insert(productOauthConnections).values(values).onConflictDoUpdate({
      target: [productOauthConnections.productId, productOauthConnections.ownerId, productOauthConnections.provider],
      set: {
        packageName: values.packageName,
        locale: values.locale,
        label: values.label,
        accountEmail: values.accountEmail,
        refreshTokenCiphertext: values.refreshTokenCiphertext,
        refreshTokenHint: values.refreshTokenHint,
        status: values.status,
        lastError: values.lastError,
        updatedAt: values.updatedAt,
      },
    });
    return workspaceRedirect(request, { productId: oauthState.productId, result: "connected" });
  } catch (error) {
    console.error("Google Play OAuth callback failed", error);
    return workspaceRedirect(request, { result: "error" });
  }
}
