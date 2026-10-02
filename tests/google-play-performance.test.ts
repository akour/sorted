import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlayPerformanceRows,
  classifyStoredPlayPerformanceRows,
  parsePlayConsoleCsv,
  suggestPlayPerformanceMapping,
  validateStoredPlayPerformanceRows,
} from "../lib/google-play-performance.ts";

test("parses quoted commas, escaped quotes, embedded newlines, and a UTF-8 BOM", () => {
  const parsed = parsePlayConsoleCsv("\uFEFFDate,Locale,Search term,Unique install clicks,CTR\r\n2026-09-01,en-US,\"stack, puzzle\",1,\"12.5%\"\r\n2026-09-02,en-US,\"line one\nline two\",2,\"14%\"");
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0][2], "stack, puzzle");
  assert.equal(parsed.rows[1][2], "line one\nline two");
  const mapping = suggestPlayPerformanceMapping(parsed.headers);
  const result = buildPlayPerformanceRows(parsed.headers, parsed.rows, mapping);
  assert.equal(result.reportType, "click-intent");
  assert.equal(result.rows[0].installClicks, 1);
  assert.equal(result.rows[0].ctr, "12.5%");
});

test("detects tab-separated reports and keeps legacy acquisitions separate", () => {
  const parsed = parsePlayConsoleCsv("Language\tCountry\tStore listing acquisitions\tConversion rate\tVisitors\nfr-FR\tFrance\t1,204\t8.4%\t1,500");
  assert.equal(parsed.delimiter, "\t");
  const result = buildPlayPerformanceRows(parsed.headers, parsed.rows, suggestPlayPerformanceMapping(parsed.headers));
  assert.equal(result.reportType, "legacy-acquisition");
  assert.equal(result.rows[0].acquisitions, 1204);
  assert.equal(result.rows[0].conversionRate, "8.4%");
  assert.equal(result.rows[0].ctr, "");
  assert.equal(result.rows[0].visitors, 1500);
});

test("classifies mixed exports without relabeling acquisitions as click metrics", () => {
  const parsed = parsePlayConsoleCsv("Unique open clicks,Acquisitions\n4,2");
  const result = buildPlayPerformanceRows(parsed.headers, parsed.rows, suggestPlayPerformanceMapping(parsed.headers));
  assert.equal(result.reportType, "mixed");
  assert.equal(result.rows[0].openClicks, 4);
  assert.equal(result.rows[0].acquisitions, 2);
  assert.equal(classifyStoredPlayPerformanceRows(result.rows), "mixed");
});

test("rejects invalid counts, duplicate field mappings, and missing performance metrics", () => {
  const parsed = parsePlayConsoleCsv("Unique install clicks,Locale\n-1,en-US");
  const mapping = suggestPlayPerformanceMapping(parsed.headers);
  assert.throws(() => buildPlayPerformanceRows(parsed.headers, parsed.rows, mapping), /non-negative whole number/);
  assert.throws(() => buildPlayPerformanceRows(parsed.headers, [["1", "en-US"]], { installClicks: 0, openClicks: 0 }), /same CSV column/);
  assert.throws(() => buildPlayPerformanceRows(["Locale"], [["en-US"]], { locale: 0 }), /Map at least one/);
  const visits = parsePlayConsoleCsv("Visitors\n15");
  assert.throws(() => buildPlayPerformanceRows(visits.headers, visits.rows, suggestPlayPerformanceMapping(visits.headers)), /Map at least one/);
});

test("validates server-bound rows and rejects malformed or oversized input", () => {
  const parsed = parsePlayConsoleCsv("Install clicks\n0");
  const rows = buildPlayPerformanceRows(parsed.headers, parsed.rows, suggestPlayPerformanceMapping(parsed.headers)).rows;
  assert.equal(validateStoredPlayPerformanceRows(rows), true);
  assert.equal(validateStoredPlayPerformanceRows([{ ...rows[0], installClicks: -1 }]), false);
  assert.equal(validateStoredPlayPerformanceRows(Array.from({ length: 2001 }, (_, index) => ({ ...rows[0], sourceRow: index + 2 }))), false);
});
