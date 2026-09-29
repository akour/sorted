import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { adminOAuthClients, optimizationPlans, productConnections, productOauthConnections, products } from "../../../../../../db/schema";
import { decryptAdminSecret, decryptProductConnectionSecret } from "../../../../../../lib/admin-secrets";
import { fetchGooglePlayListing, googlePlayErrorMessage, mergeGooglePlayListing, parseGooglePlayCredentials } from "../../../../../../lib/google-play";
import { fetchGooglePlayListingWithAccessToken, googlePlayOAuthErrorMessage, refreshGooglePlayAccessToken } from "../../../../../../lib/google-play-oauth";
import { fetchProductMetadata } from "../../../../../../lib/product-icons";
import { classifyProductUrl, normalizeProductUrlInput } from "../../../../../../lib/product-url";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    if (!Number.isSafeInteger(productId) || productId < 1) {
      return Response.json({ error: "Product not found." }, { status: 404 });
    }
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const payload = await request.json().catch(() => ({})) as { url?: unknown };
    const db = getDb();
    const [product] = await db.select().from(products)
      .where(and(eq(products.id, productId), eq(products.ownerId, ownerId)))
      .limit(1);
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });

    const rawUrl = typeof payload.url === "string" && payload.url.trim() ? payload.url : product.url;
    const sourceUrl = normalizeProductUrlInput(rawUrl);
    if (!sourceUrl) return Response.json({ error: "Add a valid public store listing URL before fetching metadata." }, { status: 400 });
    const linkKind = classifyProductUrl(sourceUrl);
    if (linkKind !== "google-play" && linkKind !== "app-store") {
      return Response.json({ error: "Use a Google Play or App Store listing URL to fetch store metadata." }, { status: 400 });
    }

    const [existing] = await db.select().from(optimizationPlans)
      .where(and(eq(optimizationPlans.productId, productId), eq(optimizationPlans.ownerId, ownerId)))
      .limit(1);
    const [googlePlayConnection] = linkKind === "google-play"
      ? await db.select().from(productConnections).where(and(eq(productConnections.productId, productId), eq(productConnections.ownerId, ownerId), eq(productConnections.provider, "google-play"))).limit(1)
      : [];
    const [googlePlayOAuthConnection] = linkKind === "google-play"
      ? await db.select().from(productOauthConnections).where(and(eq(productOauthConnections.productId, productId), eq(productOauthConnections.ownerId, ownerId), eq(productOauthConnections.provider, "google-play"))).limit(1)
      : [];
    let preview: Awaited<ReturnType<typeof fetchProductMetadata>> = null;
    try {
      preview = await fetchProductMetadata(sourceUrl);
    } catch {
      // Store pages can change shape without warning. Keep the last saved listing usable.
    }
    let currentListing = preview?.currentListing;
    let authenticatedWarning = "";
    if (googlePlayOAuthConnection) {
      try {
        const [oauthConfig] = await db.select().from(adminOAuthClients).where(eq(adminOAuthClients.providerId, "google-play")).limit(1);
        if (!oauthConfig || !oauthConfig.enabled) throw new Error("Google Play OAuth is not enabled by the administrator.");
        const stored = JSON.parse(await decryptProductConnectionSecret(googlePlayOAuthConnection.refreshTokenCiphertext)) as { refreshToken?: unknown };
        if (typeof stored.refreshToken !== "string" || !stored.refreshToken) throw new Error("The Google Play authorization is incomplete. Reconnect the account.");
        const accessToken = await refreshGooglePlayAccessToken({ clientId: oauthConfig.clientId, clientSecret: await decryptAdminSecret(oauthConfig.clientSecretCiphertext), refreshToken: stored.refreshToken });
        const authenticatedListing = await fetchGooglePlayListingWithAccessToken(accessToken, googlePlayOAuthConnection.packageName, googlePlayOAuthConnection.locale);
        currentListing = { ...authenticatedListing, sourceUrl, category: currentListing?.category, developer: currentListing?.developer, iconUrl: currentListing?.iconUrl, bundleId: currentListing?.bundleId, storeId: currentListing?.storeId };
        await db.update(productOauthConnections).set({ status: "connected", lastError: null, lastSyncedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(productOauthConnections.id, googlePlayOAuthConnection.id));
      } catch (error) {
        await db.update(productOauthConnections).set({ status: "error", lastError: googlePlayOAuthErrorMessage(error), updatedAt: new Date().toISOString() }).where(eq(productOauthConnections.id, googlePlayOAuthConnection.id));
        authenticatedWarning = `The connected Google Play account could not be refreshed (${googlePlayOAuthErrorMessage(error)}), so Sorted used the public listing instead.`;
      }
    } else if (googlePlayConnection?.status === "connected") {
      try {
        const credentials = parseGooglePlayCredentials(await decryptProductConnectionSecret(googlePlayConnection.credentialsCiphertext));
        const authenticatedListing = await fetchGooglePlayListing(credentials, googlePlayConnection.packageName, googlePlayConnection.locale);
        currentListing = mergeGooglePlayListing(authenticatedListing, sourceUrl, currentListing ?? parseSavedListing(existing?.currentListing, sourceUrl) ?? undefined);
      } catch (error) {
        authenticatedWarning = `The connected Google Play listing could not be refreshed (${googlePlayErrorMessage(error)}), so Sorted used the public listing instead.`;
      }
    }
    if (!currentListing) {
      const savedListing = parseSavedListing(existing?.currentListing, sourceUrl);
      if (savedListing) {
        return Response.json({
          currentListing: savedListing,
          warning: `The ${preview?.sourceLabel ?? "store"} listing did not allow a fresh fetch, so Sorted kept the last saved listing. Try again later to refresh it.`,
        });
      }
      return Response.json({ error: `We could not read the ${preview?.sourceLabel ?? "store"} listing. Try again or continue with the available product details.` }, { status: 502 });
    }
    if (existing) {
      await db.update(optimizationPlans).set({ currentListing: JSON.stringify(currentListing), updatedAt: new Date().toISOString() })
        .where(eq(optimizationPlans.id, existing.id));
    } else {
      await db.insert(optimizationPlans).values({ productId, ownerId, currentListing: JSON.stringify(currentListing) });
    }
    return Response.json({ currentListing, ...(authenticatedWarning ? { warning: authenticatedWarning } : {}) });
  } catch {
    try {
      const productId = Number((await context.params).id);
      const ownerId = await getOwnerId();
      if (Number.isSafeInteger(productId) && productId > 0 && ownerId) {
        const db = getDb();
        const [savedPlan] = await db.select().from(optimizationPlans)
          .where(and(eq(optimizationPlans.productId, productId), eq(optimizationPlans.ownerId, ownerId)))
          .limit(1);
        const savedListing = parseSavedListing(savedPlan?.currentListing);
        if (savedListing) {
          return Response.json({
            currentListing: savedListing,
            warning: "The store listing could not be refreshed, so Sorted kept the last saved listing. Try again later to refresh it.",
          });
        }
      }
    } catch {
      // Preserve the original response when even the saved-listing fallback is unavailable.
    }
    return Response.json({ error: "We could not fetch the current listing metadata. Try again." }, { status: 502 });
  }
}

function parseSavedListing(raw: string | undefined, sourceUrl?: string): Record<string, unknown> | null {
  try {
    const listing = JSON.parse(raw ?? "{}") as Record<string, unknown>;
    const savedSourceUrl = typeof listing.sourceUrl === "string" ? normalizeProductUrlInput(listing.sourceUrl) : "";
    return (!sourceUrl || !savedSourceUrl || savedSourceUrl === sourceUrl) && typeof listing.platform === "string" && typeof listing.title === "string" && listing.title.trim()
      ? listing
      : null;
  } catch {
    return null;
  }
}
