import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import {
  googlePlayPromoReportImports,
  googlePlayPromoReportRows,
  googlePlayPromoReportSources,
  productConnections,
  productOauthConnections,
  products,
} from "../../../../../../db/schema";
import { decryptProductConnectionSecret, encryptProductConnectionSecret, secretHint } from "../../../../../../lib/admin-secrets";
import { getGooglePlayAccessToken, parseGooglePlayCredentials, validateGooglePlayPackageName } from "../../../../../../lib/google-play";
import {
  createPromotionalReportFingerprint,
  downloadGooglePlayReport,
  GOOGLE_CLOUD_STORAGE_READ_SCOPE,
  listGooglePlayPromotionalReports,
  parseGooglePlayPromotionalReport,
  validateGooglePlayReportBucket,
  type GooglePlayPromotionalRow,
} from "../../../../../../lib/google-play-promotional-reports";
import { getOwnerId, ownerAuthenticationRequired } from "../../../../../../lib/owner";

const PROVIDER = "google-play";
const MAX_TOTAL_ROWS = 30_000;

function parseProductId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function ownedProduct(productId: number, ownerId: string) {
  const [product] = await getDb().select({ id: products.id }).from(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1);
  return product;
}

async function reportAccess(productId: number, ownerId: string, source?: typeof googlePlayPromoReportSources.$inferSelect, credentialsInput = "") {
  const [connection] = await getDb().select().from(productConnections).where(and(
    eq(productConnections.productId, productId), eq(productConnections.ownerId, ownerId), eq(productConnections.provider, PROVIDER),
  )).limit(1);
  const [oauthConnection] = await getDb().select({ packageName: productOauthConnections.packageName }).from(productOauthConnections).where(and(
    eq(productOauthConnections.productId, productId), eq(productOauthConnections.ownerId, ownerId), eq(productOauthConnections.provider, PROVIDER),
  )).limit(1);
  const [product] = await getDb().select({ url: products.url }).from(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1);
  const packageFromUrl = (() => {
    try { return new URL(product?.url ?? "").searchParams.get("id") ?? ""; }
    catch { return ""; }
  })();
  let credentialJson = credentialsInput.trim();
  if (!credentialJson && source?.credentialsCiphertext) credentialJson = await decryptProductConnectionSecret(source.credentialsCiphertext);
  if (!credentialJson && connection) credentialJson = await decryptProductConnectionSecret(connection.credentialsCiphertext);
  if (!credentialJson) throw new Error("Paste a Google service-account JSON key for read-only Play reports, or save one in this product’s Connections.");
  const credentials = parseGooglePlayCredentials(credentialJson);
  const packageName = validateGooglePlayPackageName(connection?.packageName ?? oauthConnection?.packageName ?? packageFromUrl);
  const accessToken = await getGooglePlayAccessToken(credentials, GOOGLE_CLOUD_STORAGE_READ_SCOPE);
  return { connection, credentials, packageName, accessToken };
}

async function getSummary(productId: number, ownerId: string) {
  const db = getDb();
  const [source] = await db.select().from(googlePlayPromoReportSources).where(and(
    eq(googlePlayPromoReportSources.productId, productId), eq(googlePlayPromoReportSources.ownerId, ownerId),
  )).limit(1);
  const imports = await db.select().from(googlePlayPromoReportImports).where(and(
    eq(googlePlayPromoReportImports.productId, productId), eq(googlePlayPromoReportImports.ownerId, ownerId),
  )).orderBy(desc(googlePlayPromoReportImports.createdAt), desc(googlePlayPromoReportImports.id)).limit(72);
  const latestByMonth = new Map<string, typeof imports[number]>();
  for (const report of imports) if (!latestByMonth.has(report.reportMonth)) latestByMonth.set(report.reportMonth, report);
  const selectedImports = [...latestByMonth.values()].sort((left, right) => right.reportMonth.localeCompare(left.reportMonth)).slice(0, 6);
  const fetchedRows = selectedImports.length ? await db.select().from(googlePlayPromoReportRows).where(and(
    inArray(googlePlayPromoReportRows.importId, selectedImports.map((item) => item.id)),
    eq(googlePlayPromoReportRows.productId, productId),
    eq(googlePlayPromoReportRows.ownerId, ownerId),
  )).orderBy(desc(googlePlayPromoReportRows.date), desc(googlePlayPromoReportRows.id)).limit(MAX_TOTAL_ROWS + 1) : [];
  const dataTruncated = fetchedRows.length > MAX_TOTAL_ROWS;
  const rows = fetchedRows.slice(0, MAX_TOTAL_ROWS);

  const summaries = new Map<string, {
    key: string;
    eventIds: string;
    eventNames: string;
    viewers: number;
    viewersObserved: boolean;
    converters: number;
    convertersObserved: boolean;
    countries: Set<string>;
    firstDate: string;
    lastDate: string;
    sourceRows: number;
  }>();
  for (const row of rows) {
    const key = `${row.eventIds}\u0000${row.eventNames}`;
    const summary = summaries.get(key) ?? {
      key,
      eventIds: row.eventIds,
      eventNames: row.eventNames,
      viewers: 0,
      viewersObserved: false,
      converters: 0,
      convertersObserved: false,
      countries: new Set<string>(),
      firstDate: row.date,
      lastDate: row.date,
      sourceRows: 0,
    };
    if (row.viewersDaily !== null) { summary.viewers += row.viewersDaily; summary.viewersObserved = true; }
    if (row.convertersDaily !== null) { summary.converters += row.convertersDaily; summary.convertersObserved = true; }
    if (row.country) summary.countries.add(row.country);
    if (row.date < summary.firstDate) summary.firstDate = row.date;
    if (row.date > summary.lastDate) summary.lastDate = row.date;
    summary.sourceRows += 1;
    summaries.set(key, summary);
  }

  const events = [...summaries.values()].map((event) => {
    const viewers = event.viewersObserved ? event.viewers : null;
    const converters = event.convertersObserved ? event.converters : null;
    return {
      eventIds: event.eventIds,
      eventNames: event.eventNames,
      viewers,
      converters,
      countries: event.countries.size,
      firstDate: event.firstDate,
      lastDate: event.lastDate,
      sourceRows: event.sourceRows,
      conversionRate: viewers && converters !== null ? converters / viewers : null,
    };
  }).sort((left, right) => (right.converters ?? -1) - (left.converters ?? -1) || (right.viewers ?? -1) - (left.viewers ?? -1)).slice(0, 20);
  return {
    source: source ? { bucketName: source.bucketName, credentialHint: source.credentialHint, hasDedicatedCredential: Boolean(source.credentialsCiphertext), lastSyncedAt: source.lastSyncedAt, lastError: source.lastError } : null,
    imports: selectedImports.map((item) => ({ id: item.id, reportMonth: item.reportMonth, fileName: item.fileName, rowCount: item.rowCount, createdAt: item.createdAt })),
    events,
    dataTruncated,
  };
}

async function insertReportRows(input: { importId: number; productId: number; ownerId: string; rows: GooglePlayPromotionalRow[] }) {
  const db = getDb();
  const statement = `INSERT INTO google_play_promo_report_rows (
    import_id, product_id, owner_id, source_row, date, event_ids, event_names, country,
    viewers_daily, viewers_28d, converters_daily, converters_28d, conversion_rate_daily, conversion_rate_28d
  ) SELECT ?1, ?2, ?3,
    json_extract(value, '$.sourceRow'), json_extract(value, '$.date'), json_extract(value, '$.eventIds'),
    json_extract(value, '$.eventNames'), json_extract(value, '$.country'), json_extract(value, '$.viewersDaily'),
    json_extract(value, '$.viewers28d'), json_extract(value, '$.convertersDaily'), json_extract(value, '$.converters28d'),
    json_extract(value, '$.conversionRateDaily'), json_extract(value, '$.conversionRate28d')
  FROM json_each(?4)`;
  const statements = [];
  for (let offset = 0; offset < input.rows.length; offset += 100) {
    const chunk = JSON.stringify(input.rows.slice(offset, offset + 100));
    statements.push(db.$client.prepare(statement).bind(input.importId, input.productId, input.ownerId, chunk));
  }
  for (let offset = 0; offset < statements.length; offset += 100) {
    await db.$client.batch(statements.slice(offset, offset + 100));
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = parseProductId((await context.params).id);
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    if (!productId || !(await ownedProduct(productId, ownerId))) return Response.json({ error: "Product not found." }, { status: 404 });
    const [connection] = await getDb().select({ id: productConnections.id, status: productConnections.status, credentialHint: productConnections.credentialHint }).from(productConnections).where(and(
      eq(productConnections.productId, productId), eq(productConnections.ownerId, ownerId), eq(productConnections.provider, PROVIDER),
    )).limit(1);
    const summary = await getSummary(productId, ownerId);
    return Response.json({
      ...summary,
      serviceAccountAvailable: Boolean(summary.source?.hasDedicatedCredential || connection),
      serviceAccountHint: summary.source?.credentialHint || connection?.credentialHint || "",
      serviceAccountStatus: connection?.status ?? null,
    });
  } catch {
    return Response.json({ error: "We could not load promotional content performance." }, { status: 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = parseProductId((await context.params).id);
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    if (!productId || !(await ownedProduct(productId, ownerId))) return Response.json({ error: "Product not found." }, { status: 404 });
    const payload = await request.json().catch(() => ({})) as { bucketName?: unknown; serviceAccountJson?: unknown };
    const bucketName = validateGooglePlayReportBucket(typeof payload.bucketName === "string" ? payload.bucketName : "");
    const [existingSource] = await getDb().select().from(googlePlayPromoReportSources).where(and(
      eq(googlePlayPromoReportSources.productId, productId), eq(googlePlayPromoReportSources.ownerId, ownerId),
    )).limit(1);
    const rawCredentials = typeof payload.serviceAccountJson === "string" ? payload.serviceAccountJson.trim() : "";
    const access = await reportAccess(productId, ownerId, existingSource, rawCredentials);
    const objects = await listGooglePlayPromotionalReports(bucketName, access.packageName, access.accessToken);
    const now = new Date().toISOString();
    const encryptedCredentials = rawCredentials ? await encryptProductConnectionSecret(JSON.stringify(access.credentials)) : existingSource?.credentialsCiphertext ?? null;
    const credentialHint = rawCredentials ? secretHint(access.credentials.client_email) : existingSource?.credentialHint || access.connection?.credentialHint || "";
    const db = getDb();
    const [savedSource] = await db.insert(googlePlayPromoReportSources).values({ productId, ownerId, bucketName, credentialsCiphertext: encryptedCredentials, credentialHint, updatedAt: now, lastSyncedAt: null, lastError: null }).onConflictDoUpdate({
      target: [googlePlayPromoReportSources.productId, googlePlayPromoReportSources.ownerId],
      set: { bucketName, credentialsCiphertext: encryptedCredentials, credentialHint, updatedAt: now, lastSyncedAt: null, lastError: null },
    }).returning();
    return Response.json({ source: { bucketName: savedSource?.bucketName ?? bucketName, credentialHint: savedSource?.credentialHint ?? credentialHint, hasDedicatedCredential: Boolean(savedSource?.credentialsCiphertext), lastSyncedAt: savedSource?.lastSyncedAt ?? null, lastError: savedSource?.lastError ?? null }, matchingReportCount: objects.length, serviceAccountAvailable: true, message: objects.length ? `Bucket access verified. Found ${objects.length} recent promotional report file${objects.length === 1 ? "" : "s"}.` : "Bucket access verified. No promotional report files for this app are available yet; Google may take several days to publish an export." });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Could not verify this report bucket.";
    const status = message.startsWith("Paste a Google service-account") ? 409 : 422;
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = parseProductId((await context.params).id);
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    if (!productId || !(await ownedProduct(productId, ownerId))) return Response.json({ error: "Product not found." }, { status: 404 });
    await getDb().delete(googlePlayPromoReportSources).where(and(
      eq(googlePlayPromoReportSources.productId, productId), eq(googlePlayPromoReportSources.ownerId, ownerId),
    ));
    return Response.json({ ok: true, message: "The report bucket and saved report credential were removed. Previously imported observations were kept." });
  } catch {
    return Response.json({ error: "We could not disconnect the promotional report source." }, { status: 500 });
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const productId = parseProductId((await context.params).id);
  const ownerId = await getOwnerId();
  if (!ownerId) return ownerAuthenticationRequired();
  if (!productId || !(await ownedProduct(productId, ownerId))) return Response.json({ error: "Product not found." }, { status: 404 });
  const db = getDb();
  const [source] = await db.select().from(googlePlayPromoReportSources).where(and(
    eq(googlePlayPromoReportSources.productId, productId), eq(googlePlayPromoReportSources.ownerId, ownerId),
  )).limit(1);
  if (!source) return Response.json({ error: "Add and verify the Google Play reports bucket first." }, { status: 409 });

  try {
    const access = await reportAccess(productId, ownerId, source);
    const objects = await listGooglePlayPromotionalReports(source.bucketName, access.packageName, access.accessToken);
    const priorImports = await db.select().from(googlePlayPromoReportImports).where(and(
      eq(googlePlayPromoReportImports.productId, productId), eq(googlePlayPromoReportImports.ownerId, ownerId),
    )).orderBy(desc(googlePlayPromoReportImports.createdAt)).limit(72);
    const latestByMonth = new Map<string, typeof priorImports[number]>();
    for (const item of priorImports) if (!latestByMonth.has(item.reportMonth)) latestByMonth.set(item.reportMonth, item);
    let importedFiles = 0;
    let importedRows = 0;
    let skippedFiles = 0;
    let totalRows = 0;
    const errors: string[] = [];

    for (const object of objects) {
      const prior = latestByMonth.get(object.reportMonth);
      if (object.generation && prior?.generation === object.generation) { skippedFiles += 1; continue; }
      try {
        const bytes = await downloadGooglePlayReport(source.bucketName, object.name, access.accessToken);
        const fingerprint = await createPromotionalReportFingerprint(bytes);
        const [duplicate] = await db.select({ id: googlePlayPromoReportImports.id }).from(googlePlayPromoReportImports).where(and(
          eq(googlePlayPromoReportImports.productId, productId),
          eq(googlePlayPromoReportImports.ownerId, ownerId),
          eq(googlePlayPromoReportImports.fingerprint, fingerprint),
        )).limit(1);
        if (duplicate) { skippedFiles += 1; continue; }
        const rows = parseGooglePlayPromotionalReport(bytes);
        totalRows += rows.length;
        if (totalRows > MAX_TOTAL_ROWS) throw new Error("Recent promotional reports contain too many rows for one sync. Try syncing fewer recent monthly exports.");
        const now = new Date().toISOString();
        const [report] = await db.insert(googlePlayPromoReportImports).values({
          productId, ownerId, reportMonth: object.reportMonth, fileName: object.name.split("/").at(-1) ?? object.name,
          generation: object.generation, rowCount: rows.length, fingerprint, createdAt: now,
        }).returning();
        if (!report) throw new Error("Could not create a saved promotional report record.");
        try {
          await insertReportRows({ importId: report.id, productId, ownerId, rows });
        } catch (insertError) {
          await db.delete(googlePlayPromoReportRows).where(and(eq(googlePlayPromoReportRows.importId, report.id), eq(googlePlayPromoReportRows.ownerId, ownerId)));
          await db.delete(googlePlayPromoReportImports).where(and(eq(googlePlayPromoReportImports.id, report.id), eq(googlePlayPromoReportImports.ownerId, ownerId)));
          throw insertError;
        }
        latestByMonth.set(object.reportMonth, report);
        importedFiles += 1;
        importedRows += rows.length;
      } catch (error) {
        errors.push(error instanceof Error ? `${object.name.split("/").at(-1)}: ${error.message}` : `${object.name.split("/").at(-1)}: import failed`);
        if (errors.length >= 3) break;
      }
    }

    const now = new Date().toISOString();
    const lastError = errors.length ? errors.join(" ").slice(0, 300) : null;
    await db.update(googlePlayPromoReportSources).set({ lastSyncedAt: now, lastError, updatedAt: now }).where(and(
      eq(googlePlayPromoReportSources.productId, productId), eq(googlePlayPromoReportSources.ownerId, ownerId),
    ));
    const summary = await getSummary(productId, ownerId);
    const [productConnection] = await db.select({ credentialHint: productConnections.credentialHint, status: productConnections.status }).from(productConnections).where(and(
      eq(productConnections.productId, productId), eq(productConnections.ownerId, ownerId), eq(productConnections.provider, PROVIDER),
    )).limit(1);
    const responseState = {
      ...summary,
      serviceAccountAvailable: Boolean(source.credentialsCiphertext || productConnection),
      serviceAccountHint: source.credentialHint || productConnection?.credentialHint || "",
      serviceAccountStatus: productConnection?.status ?? null,
    };
    if (errors.length && !importedFiles && !skippedFiles) return Response.json({ ...responseState, error: lastError, importedFiles, importedRows }, { status: 422 });
    return Response.json({ ...responseState, importedFiles, importedRows, skippedFiles, message: errors.length
      ? `Imported ${importedFiles} file${importedFiles === 1 ? "" : "s"}; ${errors.length} file${errors.length === 1 ? " needs" : "s need"} attention.`
      : importedFiles ? `Imported ${importedFiles} monthly report${importedFiles === 1 ? "" : "s"} with ${importedRows.toLocaleString()} daily observations.`
        : objects.length ? "Your recent report files are already up to date." : "No promotional reports for this app are available yet. Google Play report exports can take several days to appear." });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Could not sync promotional content reports.";
    const now = new Date().toISOString();
    await db.update(googlePlayPromoReportSources).set({ lastError: message, updatedAt: now }).where(and(
      eq(googlePlayPromoReportSources.productId, productId), eq(googlePlayPromoReportSources.ownerId, ownerId),
    )).catch(() => undefined);
    return Response.json({ error: message }, { status: message.startsWith("Paste a Google service-account") ? 409 : 422 });
  }
}
