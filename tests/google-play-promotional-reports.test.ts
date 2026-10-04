import assert from "node:assert/strict";
import test from "node:test";
import {
  googlePlayReportMonth,
  parseGooglePlayPromotionalReport,
  validateGooglePlayReportBucket,
} from "../lib/google-play-promotional-reports.ts";

function buffer(value: string) {
  return new TextEncoder().encode(value).buffer;
}

test("parses promotional daily outcomes and keeps rolling metrics separate", () => {
  const report = [
    "Date,Event ID,Event name,Country,Total unique viewers (daily),Total unique viewers (last 28 days),Total unique converters (daily),Total unique converters (last 28 days),Conversion rate (daily),Conversion rate (last 28 days)",
    '2026-09-01,EV-1,"Launch, Week 1",US,"1,200","2,400",120,330,10%,13.75%',
  ].join("\n");
  const rows = parseGooglePlayPromotionalReport(buffer(report));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].eventNames, "Launch, Week 1");
  assert.equal(rows[0].viewersDaily, 1200);
  assert.equal(rows[0].viewers28d, 2400);
  assert.equal(rows[0].convertersDaily, 120);
  assert.equal(rows[0].conversionRateDaily, "10%");
});

test("reads Google UTF-16 little-endian report exports", () => {
  const text = "Date,Event name,Country,Unique viewers daily,Unique converters daily\n2026-09-02,New season,GB,24,6";
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes[0] = 0xff; bytes[1] = 0xfe;
  for (let index = 0; index < text.length; index += 1) bytes[2 + index * 2] = text.charCodeAt(index);
  const rows = parseGooglePlayPromotionalReport(bytes.buffer);
  assert.equal(rows[0].country, "GB");
  assert.equal(rows[0].viewersDaily, 24);
  assert.equal(rows[0].convertersDaily, 6);
});

test("rejects unknown report headers without importing guessed metrics", () => {
  assert.throws(() => parseGooglePlayPromotionalReport(buffer("Date,Event name,Impressions\n2026-09-01,Event A,99")), /columns did not match/);
  assert.throws(() => parseGooglePlayPromotionalReport(buffer("Date,Event name,Unique viewers daily,Unique converters daily\n2026-09-01,Event A,-1,2")), /non-negative whole number/);
});

test("accepts only Play Console report bucket identifiers and extracts report month", () => {
  assert.equal(validateGooglePlayReportBucket("gs://pubsite_prod_rev_1234567890/"), "pubsite_prod_rev_1234567890");
  assert.throws(() => validateGooglePlayReportBucket("gs://my-public-bucket"), /starts with pubsite_prod_rev/);
  assert.equal(googlePlayReportMonth("stats/promotional_content/report_com.example_202609.csv", ""), "2026-09");
});
