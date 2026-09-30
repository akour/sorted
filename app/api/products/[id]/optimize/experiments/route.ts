import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { asoExperiments, optimizationPlans, products } from "../../../../../../db/schema";
import {
  GOOGLE_PLAY_EXPERIMENT_FIELDS,
  isGooglePlayExperimentField,
  validateGooglePlayExperimentDraft,
} from "../../../../../../lib/google-play-experiments";

type ListingSnapshot = Record<string, unknown> & {
  platform?: unknown;
  fetchSource?: unknown;
  language?: unknown;
  fetchedAt?: unknown;
  storeId?: unknown;
  sourceUrl?: unknown;
};

function parseListing(value: string | null | undefined): ListingSnapshot {
  try {
    const parsed: unknown = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ListingSnapshot : {};
  } catch {
    return {};
  }
}

function publicExperiment(experiment: typeof asoExperiments.$inferSelect) {
  return Object.fromEntries(Object.entries(experiment).filter(([key]) => key !== "ownerId"));
}

async function getOwnedProduct(productId: number, ownerId: string) {
  const [product] = await getDb().select().from(products)
    .where(and(eq(products.id, productId), eq(products.ownerId, ownerId)))
    .limit(1);
  return product;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    if (!Number.isSafeInteger(productId) || productId < 1) return Response.json({ error: "Product not found." }, { status: 404 });
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    if (!(await getOwnedProduct(productId, ownerId))) return Response.json({ error: "Product not found." }, { status: 404 });
    const experiments = await getDb().select().from(asoExperiments)
      .where(and(eq(asoExperiments.productId, productId), eq(asoExperiments.ownerId, ownerId)))
      .orderBy(desc(asoExperiments.createdAt), desc(asoExperiments.id));
    return Response.json({ experiments: experiments.map(publicExperiment) });
  } catch {
    return Response.json({ error: "We could not load the experiment history." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    if (!Number.isSafeInteger(productId) || productId < 1) return Response.json({ error: "Product not found." }, { status: 404 });
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const db = getDb();
    const [product] = await db.select().from(products)
      .where(and(eq(products.id, productId), eq(products.ownerId, ownerId)))
      .limit(1);
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Enter a valid experiment plan." }, { status: 400 });
    const payload = body as Record<string, unknown>;
    if (!isGooglePlayExperimentField(payload.field)) return Response.json({ error: "Choose a supported Google Play description field." }, { status: 400 });

    const [plan] = await db.select().from(optimizationPlans)
      .where(and(eq(optimizationPlans.productId, productId), eq(optimizationPlans.ownerId, ownerId)))
      .limit(1);
    const listing = parseListing(plan?.currentListing);
    const field = GOOGLE_PLAY_EXPERIMENT_FIELDS[payload.field];
    const baseline = listing[field.listingKey];
    const productPackageName = (() => {
      try {
        return new URL(product.url).searchParams.get("id");
      } catch {
        return null;
      }
    })();
    const listingPackageName = typeof listing.storeId === "string" ? listing.storeId : null;
    if (listing.platform !== "Google Play" || !productPackageName || !listingPackageName || listingPackageName !== productPackageName) {
      return Response.json({ error: "The saved listing does not match this product’s current Google Play URL. Sync the correct app before planning an experiment." }, { status: 409 });
    }
    const validationError = validateGooglePlayExperimentDraft({
      field: payload.field,
      hypothesis: payload.hypothesis,
      baseline,
      variant: payload.variant,
      fetchSource: listing.fetchSource,
    });
    if (validationError) return Response.json({ error: validationError }, { status: 400 });
    if (typeof listing.fetchedAt !== "string" || !Number.isFinite(Date.parse(listing.fetchedAt))) {
      return Response.json({ error: "Refresh the authenticated Google Play listing before planning an experiment." }, { status: 409 });
    }

    const locale = typeof listing.language === "string" && listing.language.trim() ? listing.language : "";
    if (!locale || !listingPackageName) return Response.json({ error: "The authenticated listing is missing its package or locale. Sync it again before planning an experiment." }, { status: 409 });

    const [activeExperiment] = await db.select({ id: asoExperiments.id }).from(asoExperiments)
      .where(and(
        eq(asoExperiments.productId, productId),
        eq(asoExperiments.ownerId, ownerId),
        eq(asoExperiments.locale, locale),
        inArray(asoExperiments.status, ["planned", "running"]),
      ))
      .limit(1);
    if (activeExperiment) return Response.json({ error: "Finish or cancel the existing experiment for this locale before planning another. Play Console recommends testing one listing asset at a time." }, { status: 409 });

    const now = new Date().toISOString();
    const [experiment] = await db.insert(asoExperiments).values({
      productId,
      ownerId,
      packageName: listingPackageName,
      locale,
      field: payload.field,
      hypothesis: (payload.hypothesis as string).trim(),
      baselineText: baseline as string,
      variantText: (payload.variant as string).trim(),
      baselineFetchedAt: listing.fetchedAt,
      status: "planned",
      createdAt: now,
      updatedAt: now,
    }).returning();
    return Response.json({ experiment: publicExperiment(experiment) }, { status: 201 });
  } catch {
    return Response.json({ error: "We could not save this experiment plan." }, { status: 500 });
  }
}
