import assert from "node:assert/strict";
import test from "node:test";
import { parseGooglePlayPerformanceCsv } from "../lib/google-play-performance.ts";

const header = "Event ID,Event names,Total unique viewers (daily),Total unique viewers (last 28 days),Total unique converters (daily),Total unique converters (last 28 days),Conversion rate (daily),Conversion rate (last 28 days),Date,Country";

test("parses official Play report headers, quoted fields, BOM and country rows", () => {
  const csv = `\uFEFF${header}\r\n"event-123","Spring, challenge",1,26,2,14,2.4%,1.8%,2026-09-28,us\r\n"event-123","Spring, challenge",0,26,0,14,—,1.8%,2026-09-28,gb`;
  assert.deepEqual(parseGooglePlayPerformanceCsv(csv, "event-123"), [
    { reportDate: "2026-09-28", countryCode: "US", dailyViewers: 1, rolling28Viewers: 26, dailyConverters: 2, rolling28Converters: 14, dailyConversionRate: "2.4%", rolling28ConversionRate: "1.8%" },
    { reportDate: "2026-09-28", countryCode: "GB", dailyViewers: 0, rolling28Viewers: 26, dailyConverters: 0, rolling28Converters: 14, dailyConversionRate: null, rolling28ConversionRate: "1.8%" },
  ]);
});

test("normalizes common date and aggregate-country formats without summing rolling values", () => {
  const csv = `${header}\n123,Example,1,28,1,5,0.5,1.2,09/28/2026,All countries`;
  assert.deepEqual(parseGooglePlayPerformanceCsv(csv, "123")[0], {
    reportDate: "2026-09-28", countryCode: "ALL", dailyViewers: 1, rolling28Viewers: 28,
    dailyConverters: 1, rolling28Converters: 5, dailyConversionRate: "0.5", rolling28ConversionRate: "1.2",
  });
});

test("rejects multi-event aggregates and mismatched event IDs", () => {
  assert.throws(() => parseGooglePlayPerformanceCsv(`${header}\n123;456,Combined,1,1,1,1,1%,1%,2026-09-28,us`, "123"), /combines multiple/);
  assert.throws(() => parseGooglePlayPerformanceCsv(`${header}\n456,Other,1,1,1,1,1%,1%,2026-09-28,us`, "123"), /does not match/);
});

test("rejects incomplete, duplicate, malformed, or invalid metric rows", () => {
  assert.throws(() => parseGooglePlayPerformanceCsv("Event ID,Date\n123,2026-09-28", "123"), /missing.*country/i);
  const duplicate = `${header}\n123,Example,1,1,1,1,1%,1%,2026-09-28,us\n123,Example,2,2,2,2,2%,2%,2026-09-28,US`;
  assert.throws(() => parseGooglePlayPerformanceCsv(duplicate, "123"), /appear more than once/);
  assert.throws(() => parseGooglePlayPerformanceCsv(`${header}\n123,Example,-1,1,1,1,1%,1%,2026-09-28,us`, "123"), /non-negative whole number/);
  assert.throws(() => parseGooglePlayPerformanceCsv(`${header}\n123,Example,1,1,1,1,101%,1%,2026-09-28,us`, "123"), /between 0 and 100/);
});
