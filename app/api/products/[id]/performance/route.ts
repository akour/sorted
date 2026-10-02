import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { googlePlayPerformanceImports, googlePlayPerformanceRows, products } from "../../../../../db/schema";
import { classifyStoredPlayPerformanceRows, validateStoredPlayPerformanceRows, type PlayPerformanceRow } from "../../../../../lib/google-play-performance";
import { getOwnerId, ownerAuthenticationRequired } from "../../../../../lib/owner";

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 2_000;

function validProductId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = validProductId((await context.params).id);
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    if (!productId) return Response.json({ error: "Product not found." }, { status: 404 });
    const db = getDb();
    const [product] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1);
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
    const imports = await db.select({
      id: googlePlayPerformanceImports.id,
      productId: googlePlayPerformanceImports.productId,
      reportType: googlePlayPerformanceImports.reportType,
      fileName: googlePlayPerformanceImports.fileName,
      rowCount: googlePlayPerformanceImports.rowCount,
      dateStart: googlePlayPerformanceImports.dateStart,
      dateEnd: googlePlayPerformanceImports.dateEnd,
      createdAt: googlePlayPerformanceImports.createdAt,
    }).from(googlePlayPerformanceImports)
      .where(and(eq(googlePlayPerformanceImports.productId, productId), eq(googlePlayPerformanceImports.ownerId, ownerId)))
      .orderBy(desc(googlePlayPerformanceImports.createdAt), desc(googlePlayPerformanceImports.id)).limit(25);
    const requestedId = Number(new URL(request.url).searchParams.get("importId"));
    const selectedImport = imports.find((item) => item.id === requestedId) ?? imports[0] ?? null;
    const rows = selectedImport ? await db.select().from(googlePlayPerformanceRows)
      .where(and(eq(googlePlayPerformanceRows.importId, selectedImport.id), eq(googlePlayPerformanceRows.productId, productId), eq(googlePlayPerformanceRows.ownerId, ownerId)))
      .orderBy(googlePlayPerformanceRows.sourceRow).limit(MAX_IMPORT_ROWS) : [];
    return Response.json({ imports, selectedImportId: selectedImport?.id ?? null, rows });
  } catch {
    return Response.json({ error: "We could not load this product’s Google Play reports." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = validProductId((await context.params).id);
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    if (!productId) return Response.json({ error: "Product not found." }, { status: 404 });
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return Response.json({ error: "This normalized report is too large. Split the export into smaller date ranges and retry." }, { status: 413 });
    const payload = JSON.parse(text) as { fileName?: unknown; rows?: unknown };
    if (!Array.isArray(payload.rows) || !validateStoredPlayPerformanceRows(payload.rows)) {
      return Response.json({ error: `The report must contain 1–${MAX_IMPORT_ROWS.toLocaleString()} valid, mapped rows.` }, { status: 400 });
    }
    const rows = payload.rows as PlayPerformanceRow[];
    const safeName = typeof payload.fileName === "string" ? payload.fileName.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 120) : "Google Play report.csv";
    const reportType = classifyStoredPlayPerformanceRows(rows);
    if (reportType === "unknown") return Response.json({ error: "Map at least one observed click or CTR metric, or a legacy acquisition / conversion metric." }, { status: 400 });
    const dates = rows.map((row) => row.date.trim()).filter(Boolean);
    const comparableIsoDates = dates.length > 0 && dates.every((date) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
      const parsed = new Date(`${date}T00:00:00.000Z`);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
    });
    if (comparableIsoDates) dates.sort((left, right) => left.localeCompare(right));
    const fingerprintSource = JSON.stringify({ reportType, rows });
    const fingerprintBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fingerprintSource));
    const fingerprint = Array.from(new Uint8Array(fingerprintBytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const db = getDb();
    const [product] = await db.select({ id: products.id }).from(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1);
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
    const [duplicate] = await db.select().from(googlePlayPerformanceImports).where(and(
      eq(googlePlayPerformanceImports.productId, productId),
      eq(googlePlayPerformanceImports.ownerId, ownerId),
      eq(googlePlayPerformanceImports.fingerprint, fingerprint),
    )).limit(1);
    if (duplicate) return Response.json({ import: duplicate, duplicate: true, message: "This exact report is already saved for this product." });

    const [report] = await db.insert(googlePlayPerformanceImports).values({
      productId, ownerId, reportType, fileName: safeName, rowCount: rows.length,
      dateStart: comparableIsoDates ? dates[0] : "", dateEnd: comparableIsoDates ? dates.at(-1) ?? "" : "", fingerprint,
    }).returning();
    try {
      const insertStatement = `INSERT INTO google_play_performance_rows (
        import_id, product_id, owner_id, source_row, date, locale, country, search_term,
        traffic_source, visitors, install_clicks, open_clicks, pre_registration_clicks, ctr, conversion_rate, acquisitions
      ) SELECT ?1, ?2, ?3,
        json_extract(value, '$.sourceRow'), json_extract(value, '$.date'),
        json_extract(value, '$.locale'), json_extract(value, '$.country'),
        json_extract(value, '$.searchTerm'), json_extract(value, '$.trafficSource'),
        json_extract(value, '$.visitors'), json_extract(value, '$.installClicks'),
        json_extract(value, '$.openClicks'), json_extract(value, '$.preRegistrationClicks'),
        json_extract(value, '$.ctr'), json_extract(value, '$.conversionRate'), json_extract(value, '$.acquisitions')
      FROM json_each(?4)`;
      const statements = [];
      for (let offset = 0; offset < rows.length; offset += 100) {
        const chunk = JSON.stringify(rows.slice(offset, offset + 100));
        statements.push(db.$client.prepare(insertStatement).bind(report.id, productId, ownerId, chunk));
      }
      await db.$client.batch(statements);
    } catch (error) {
      await db.delete(googlePlayPerformanceRows).where(and(eq(googlePlayPerformanceRows.importId, report.id), eq(googlePlayPerformanceRows.ownerId, ownerId)));
      await db.delete(googlePlayPerformanceImports).where(and(eq(googlePlayPerformanceImports.id, report.id), eq(googlePlayPerformanceImports.ownerId, ownerId)));
      throw error;
    }
    return Response.json({ import: report, duplicate: false }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "The report upload was not valid JSON. Choose the CSV again and retry." }, { status: 400 });
    console.error("Google Play report import failed", error);
    return Response.json({ error: "We could not save this Google Play report. No original CSV is retained." }, { status: 500 });
  }
}
