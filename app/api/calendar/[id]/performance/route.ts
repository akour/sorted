import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { promoEventPerformance, promoEvents } from "../../../../../db/schema";
import { parseGooglePlayPerformanceCsv } from "../../../../../lib/google-play-performance";

const MAX_CSV_BYTES = 2_000_000;
const MAX_BATCH_SIZE = 50;

class CsvTooLargeError extends Error {}

function parseGooglePlayData(value: string | null) {
  try {
    const parsed: unknown = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function readCsvBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_CSV_BYTES) throw new CsvTooLargeError();
  if (!request.body) throw new Error("Choose a Google Play CSV report first.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_CSV_BYTES) {
        await reader.cancel();
        throw new CsvTooLargeError();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

async function getPerformanceRows(eventId: number, ownerId: string) {
  return getDb().select({
    id: promoEventPerformance.id,
    reportDate: promoEventPerformance.reportDate,
    countryCode: promoEventPerformance.countryCode,
    dailyViewers: promoEventPerformance.dailyViewers,
    rolling28Viewers: promoEventPerformance.rolling28Viewers,
    dailyConverters: promoEventPerformance.dailyConverters,
    rolling28Converters: promoEventPerformance.rolling28Converters,
    dailyConversionRate: promoEventPerformance.dailyConversionRate,
    rolling28ConversionRate: promoEventPerformance.rolling28ConversionRate,
    importedAt: promoEventPerformance.importedAt,
  }).from(promoEventPerformance)
    .where(and(eq(promoEventPerformance.promoEventId, eventId), eq(promoEventPerformance.ownerId, ownerId)))
    .orderBy(desc(promoEventPerformance.reportDate), asc(promoEventPerformance.countryCode))
    .limit(5_000);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const eventId = Number((await context.params).id);
    if (!Number.isSafeInteger(eventId) || eventId < 1) return Response.json({ error: "Promo event not found." }, { status: 404 });
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const [event] = await getDb().select({ id: promoEvents.id }).from(promoEvents)
      .where(and(eq(promoEvents.id, eventId), eq(promoEvents.ownerId, ownerId))).limit(1);
    if (!event) return Response.json({ error: "Promo event not found." }, { status: 404 });
    return Response.json({ metrics: await getPerformanceRows(eventId, ownerId) });
  } catch {
    return Response.json({ error: "We could not load the Google Play performance report." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const eventId = Number((await context.params).id);
    if (!Number.isSafeInteger(eventId) || eventId < 1) return Response.json({ error: "Promo event not found." }, { status: 404 });
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const db = getDb();
    const [event] = await db.select().from(promoEvents)
      .where(and(eq(promoEvents.id, eventId), eq(promoEvents.ownerId, ownerId))).limit(1);
    if (!event) return Response.json({ error: "Promo event not found." }, { status: 404 });

    const googlePlay = parseGooglePlayData(event.googlePlay);
    const playEventId = typeof googlePlay.consoleEventId === "string" ? googlePlay.consoleEventId.trim() : "";
    if (!playEventId) return Response.json({ error: "Save this event’s Google Play Console event ID before importing its report." }, { status: 409 });

    let rows;
    try {
      rows = parseGooglePlayPerformanceCsv(await readCsvBody(request), playEventId);
    } catch (error) {
      if (error instanceof CsvTooLargeError) return Response.json({ error: "The CSV is too large. Choose a report under 2 MB or export a shorter date range." }, { status: 413 });
      return Response.json({ error: error instanceof Error ? error.message : "The Google Play CSV could not be read." }, { status: 400 });
    }

    const importedAt = new Date().toISOString();
    for (let offset = 0; offset < rows.length; offset += MAX_BATCH_SIZE) {
      const chunk = rows.slice(offset, offset + MAX_BATCH_SIZE);
      const statements = chunk.map((row) => db.insert(promoEventPerformance).values({
        promoEventId: eventId,
        productId: event.productId,
        ownerId,
        playEventId,
        reportDate: row.reportDate,
        countryCode: row.countryCode,
        dailyViewers: row.dailyViewers,
        rolling28Viewers: row.rolling28Viewers,
        dailyConverters: row.dailyConverters,
        rolling28Converters: row.rolling28Converters,
        dailyConversionRate: row.dailyConversionRate,
        rolling28ConversionRate: row.rolling28ConversionRate,
        importedAt,
      }).onConflictDoUpdate({
        target: [promoEventPerformance.ownerId, promoEventPerformance.promoEventId, promoEventPerformance.reportDate, promoEventPerformance.countryCode],
        set: {
          playEventId: sql`excluded.play_event_id`,
          productId: sql`excluded.product_id`,
          dailyViewers: sql`excluded.daily_viewers`,
          rolling28Viewers: sql`excluded.rolling28_viewers`,
          dailyConverters: sql`excluded.daily_converters`,
          rolling28Converters: sql`excluded.rolling28_converters`,
          dailyConversionRate: sql`excluded.daily_conversion_rate`,
          rolling28ConversionRate: sql`excluded.rolling28_conversion_rate`,
          importedAt: sql`excluded.imported_at`,
        },
      }));
      await db.batch(statements);
    }

    return Response.json({ importedRows: rows.length, metrics: await getPerformanceRows(eventId, ownerId) });
  } catch {
    return Response.json({ error: "We could not import the Google Play report. You can safely retry the same CSV." }, { status: 500 });
  }
}
