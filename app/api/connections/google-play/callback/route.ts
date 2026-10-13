import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { adminOAuthClients, googlePlayOAuthStates, googleSearchConsoleConnections, googleSearchConsoleOAuthStates, productOauthConnections } from "@/db/schema";
import { decryptAdminSecret, decryptProductConnectionSecret, encryptProductConnectionSecret, secretHint } from "@/lib/admin-secrets";
import { exchangeGoogleOAuthAuthorizationCode, exchangeGooglePlayAuthorizationCode, hashGooglePlayOAuthState } from "@/lib/google-play-oauth";

const PROVIDER = "google-play";

function workspaceRedirect(request: Request, input: { productId?: number; result: "connected" | "cancelled" | "error" }) {
  const url = new URL("/workspace", request.url);
  if (input.productId) url.searchParams.set("productId", String(input.productId));
  url.searchParams.set("googlePlay", input.result);
  return Response.redirect(url, 303);
}

function searchConsoleWorkspaceRedirect(request: Request, input: { productId?: number; result: "connected" | "cancelled" | "error" }) {
  const url = new URL("/workspace", request.url);
  if (input.productId) url.searchParams.set("productId", String(input.productId));
  url.searchParams.set("section", "seo");
  url.searchParams.set("googleSearchConsole", input.result);
  return Response.redirect(url, 303);
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const state = query.get("state")?.trim() ?? "";
  if (!state) return workspaceRedirect(request, { result: "error" });
  let searchConsoleProductId: number | undefined;

  try {
    const stateHash = await hashGooglePlayOAuthState(state);
    const db = getDb();
    const [searchConsoleState] = await db.select().from(googleSearchConsoleOAuthStates).where(eq(googleSearchConsoleOAuthStates.stateHash, stateHash)).limit(1);
    if (searchConsoleState) {
      searchConsoleProductId = searchConsoleState.productId;
      if (searchConsoleState.usedAt || new Date(searchConsoleState.expiresAt).getTime() < Date.now()) return searchConsoleWorkspaceRedirect(request, { productId: searchConsoleState.productId, result: "error" });
      const now = new Date().toISOString();
      const [claimedState] = await db.update(googleSearchConsoleOAuthStates).set({ usedAt: now }).where(and(eq(googleSearchConsoleOAuthStates.stateHash, stateHash), isNull(googleSearchConsoleOAuthStates.usedAt))).returning();
      if (!claimedState) return searchConsoleWorkspaceRedirect(request, { productId: searchConsoleState.productId, result: "error" });
      if (query.get("error")) return searchConsoleWorkspaceRedirect(request, { productId: searchConsoleState.productId, result: "cancelled" });
      const code = query.get("code")?.trim() ?? "";
      if (!code) return searchConsoleWorkspaceRedirect(request, { productId: searchConsoleState.productId, result: "error" });

      const [oauthConfig] = await db.select().from(adminOAuthClients).where(eq(adminOAuthClients.providerId, PROVIDER)).limit(1);
      if (!oauthConfig || !oauthConfig.enabled) return searchConsoleWorkspaceRedirect(request, { productId: searchConsoleState.productId, result: "error" });
      const clientSecret = await decryptAdminSecret(oauthConfig.clientSecretCiphertext);
      const redirectUri = new URL("/api/connections/google-play/callback", request.url).toString();
      const tokens = await exchangeGoogleOAuthAuthorizationCode({ code, clientId: oauthConfig.clientId, clientSecret, redirectUri });
      const [existing] = await db.select().from(googleSearchConsoleConnections).where(eq(googleSearchConsoleConnections.ownerId, searchConsoleState.ownerId)).limit(1);
      let previousRefreshToken = "";
      if (existing) {
        try { previousRefreshToken = (JSON.parse(await decryptProductConnectionSecret(existing.refreshTokenCiphertext)) as { refreshToken?: string }).refreshToken ?? ""; }
        catch { /* A new consent may replace an unreadable saved token. */ }
      }
      const refreshToken = tokens.refreshToken || previousRefreshToken;
      if (!tokens.accessToken || !refreshToken) return searchConsoleWorkspaceRedirect(request, { productId: searchConsoleState.productId, result: "error" });
      const values = {
        ownerId: searchConsoleState.ownerId,
        accountEmail: tokens.accountEmail || existing?.accountEmail || "",
        refreshTokenCiphertext: await encryptProductConnectionSecret(JSON.stringify({ refreshToken })),
        refreshTokenHint: secretHint(refreshToken),
        status: "connected",
        lastError: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await db.insert(googleSearchConsoleConnections).values(values).onConflictDoUpdate({
        target: googleSearchConsoleConnections.ownerId,
        set: { accountEmail: values.accountEmail, refreshTokenCiphertext: values.refreshTokenCiphertext, refreshTokenHint: values.refreshTokenHint, status: values.status, lastError: values.lastError, updatedAt: values.updatedAt },
      });
      return searchConsoleWorkspaceRedirect(request, { productId: searchConsoleState.productId, result: "connected" });
    }

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
    console.error("Google OAuth callback failed", error);
    if (searchConsoleProductId) return searchConsoleWorkspaceRedirect(request, { productId: searchConsoleProductId, result: "error" });
    return workspaceRedirect(request, { result: "error" });
  }
}
