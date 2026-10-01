import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { adminOAuthClients, optimizationPlans, productConnections, productOauthConnections, products } from "../../../../../../db/schema";
import { decryptAdminSecret, decryptProductConnectionSecret } from "../../../../../../lib/admin-secrets";
import { getGooglePlayAccessToken, parseGooglePlayCredentials, publishGooglePlayListingsWithAccessToken } from "../../../../../../lib/google-play";
import { refreshGooglePlayAccessToken } from "../../../../../../lib/google-play-oauth";
import { getOwnerId, ownerAuthenticationRequired } from "../../../../../../lib/owner";
import {
  isGooglePlayTargetLocale,
  listingSourceFingerprint,
  parseGooglePlayCurrentListing,
  parseLocalizedStoreListings,
  resolveGooglePlayListingSource,
  validateGooglePlayListingText,
} from "../../../../../../lib/google-play-localizations";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    if (!Number.isSafeInteger(productId) || productId < 1) return Response.json({ error: "Product not found." }, { status: 404 });

    const payload = await request.json() as { locales?: unknown };
    if (!Array.isArray(payload.locales) || payload.locales.length < 1 || payload.locales.length > 11 || payload.locales.some((locale) => typeof locale !== "string")) {
      return Response.json({ error: "Select one or more complete Google Play locales to publish." }, { status: 400 });
    }
    const locales = payload.locales as string[];
    if (new Set(locales).size !== locales.length || locales.some((locale) => locale !== "en-US" && !isGooglePlayTargetLocale(locale))) {
      return Response.json({ error: "The selected list includes an unsupported or duplicate locale." }, { status: 400 });
    }

    const db = getDb();
    const [product] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1);
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
    const [plan] = await db.select().from(optimizationPlans).where(and(eq(optimizationPlans.productId, productId), eq(optimizationPlans.ownerId, ownerId))).limit(1);
    if (!plan) return Response.json({ error: "Build and save the Google Play listing in Optimize first." }, { status: 400 });

    const { listing: source } = resolveGooglePlayListingSource({
      title: plan.storeTitle.trim(),
      shortDescription: plan.storeShortDescription.trim(),
      fullDescription: plan.storeLongDescription.trim(),
    }, parseGooglePlayCurrentListing(plan.currentListing));
    const localized = parseLocalizedStoreListings(plan.localizedListings);
    const sourceHash = listingSourceFingerprint(source);
    const listings = locales.map((locale) => {
      if (locale === "en-US") return { language: locale, ...source };
      const translation = localized.find((item) => item.locale === locale);
      if (!translation) throw new Error(`Create the ${locale} translation before publishing it.`);
      if (translation.sourceHash !== sourceHash) throw new Error(`The ${locale} translation is based on older English copy. Update and review it before publishing.`);
      if (translation.status !== "ready") throw new Error(`Review and mark the ${locale} translation ready before publishing.`);
      return { language: locale, title: translation.title, shortDescription: translation.shortDescription, fullDescription: translation.fullDescription };
    });
    for (const listing of listings) {
      const errors = validateGooglePlayListingText(listing);
      if (errors.length) return Response.json({ error: `${listing.language}: ${errors.join(" ")}` }, { status: 400 });
    }

    const [serviceConnection] = await db.select().from(productConnections).where(and(eq(productConnections.productId, productId), eq(productConnections.ownerId, ownerId), eq(productConnections.provider, "google-play"))).limit(1);
    const [oauthConnection] = await db.select().from(productOauthConnections).where(and(eq(productOauthConnections.productId, productId), eq(productOauthConnections.ownerId, ownerId), eq(productOauthConnections.provider, "google-play"))).limit(1);
    if (!serviceConnection && !oauthConnection) return Response.json({ error: "Connect a Google Play account for this product in Connections before publishing." }, { status: 400 });

    let accessToken = "";
    let packageName = "";
    if (oauthConnection) {
      const [oauthConfig] = await db.select().from(adminOAuthClients).where(eq(adminOAuthClients.providerId, "google-play")).limit(1);
      if (!oauthConfig || !oauthConfig.enabled) throw new Error("Google Play OAuth is not enabled by the administrator.");
      const stored = JSON.parse(await decryptProductConnectionSecret(oauthConnection.refreshTokenCiphertext)) as { refreshToken?: unknown };
      if (typeof stored.refreshToken !== "string" || !stored.refreshToken) throw new Error("The Google Play authorization is incomplete. Reconnect this product.");
      accessToken = await refreshGooglePlayAccessToken({
        clientId: oauthConfig.clientId,
        clientSecret: await decryptAdminSecret(oauthConfig.clientSecretCiphertext),
        refreshToken: stored.refreshToken,
      });
      packageName = oauthConnection.packageName;
    } else if (serviceConnection) {
      const credentials = parseGooglePlayCredentials(await decryptProductConnectionSecret(serviceConnection.credentialsCiphertext));
      accessToken = await getGooglePlayAccessToken(credentials);
      packageName = serviceConnection.packageName;
    }

    const result = await publishGooglePlayListingsWithAccessToken(accessToken, packageName, listings);
    const now = new Date().toISOString();
    if (oauthConnection) await db.update(productOauthConnections).set({ status: "connected", lastError: null, updatedAt: now }).where(eq(productOauthConnections.id, oauthConnection.id));
    if (serviceConnection) await db.update(productConnections).set({ status: "connected", lastError: null, updatedAt: now }).where(eq(productConnections.id, serviceConnection.id));
    return Response.json({ status: "submitted", publishedLocales: result.publishedLocales, submittedAt: now, message: "Google Play accepted the listing edit. Store changes may take time to appear and remain subject to Google Play review." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Play could not publish these listings.";
    return Response.json({ error: message.slice(0, 500) }, { status: 422 });
  }
}
