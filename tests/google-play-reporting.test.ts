import assert from "node:assert/strict";
import test from "node:test";
import { buildGooglePlayAuthorizationUrl } from "../lib/google-play-oauth.ts";
import {
  fetchGooglePlayQualitySnapshot,
  googlePlayReportingDateRange,
  parseGooglePlayQualityMetricRows,
} from "../lib/google-play-reporting.ts";

test("Google Play authorization requests both publishing and reporting permissions", () => {
  const url = new URL(buildGooglePlayAuthorizationUrl({ clientId: "client.apps.googleusercontent.com", redirectUri: "https://sorted.example/callback", state: "state" }));
  const scopes = new Set(url.searchParams.get("scope")?.split(" "));
  assert.ok(scopes.has("https://www.googleapis.com/auth/androidpublisher"));
  assert.ok(scopes.has("https://www.googleapis.com/auth/playdeveloperreporting"));
  assert.equal(url.searchParams.get("access_type"), "offline");
});

test("builds a 30-day daily reporting interval aligned to Google Play's Pacific timezone", () => {
  const range = googlePlayReportingDateRange(new Date("2026-10-02T20:00:00.000Z"));
  assert.equal(range.dateStart, "2026-09-02");
  assert.equal(range.dateEnd, "2026-10-01");
  assert.equal(range.timelineSpec.aggregationPeriod, "DAILY");
  assert.equal(range.timelineSpec.startTime.timeZone, "America/Los_Angeles");
  assert.equal(range.timelineSpec.endTime.day, 2);
});

test("parses only supported Google quality metrics and merges crash and ANR data by day", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    const isCrash = url.includes("crashRateMetricSet");
    const rows = isCrash
      ? [{ startTime: { year: 2026, month: 10, day: 1 }, metrics: [
        { metric: "crashRate28dUserWeighted", decimalValue: "0.0012" },
        { metric: "userPerceivedCrashRate28dUserWeighted", decimalValue: "0.0008" },
        { metric: "unrequestedMetric", decimalValue: "999" },
      ] }]
      : [{ startTime: { year: 2026, month: 10, day: 1 }, metrics: [
        { metric: "anrRate28dUserWeighted", decimalValue: "0.0021" },
        { metric: "userPerceivedAnrRate28dUserWeighted", decimalValue: "0.0011" },
      ] }];
    return new Response(JSON.stringify({ rows }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const snapshot = await fetchGooglePlayQualitySnapshot({ packageName: "com.example.game", accessToken: "secret-test-token", now: new Date("2026-10-02T20:00:00.000Z"), syncedAt: "2026-10-02T21:00:00.000Z", fetcher });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.init?.method === "POST"));
  assert.ok(calls.every((call) => (call.init?.headers as Record<string, string>).authorization === "Bearer secret-test-token"));
  const request = JSON.parse(String(calls[0].init?.body)) as { metrics: string[]; pageSize: number; userCohort: string };
  assert.equal(request.pageSize, 100);
  assert.equal(request.userCohort, "OS_PUBLIC");
  assert.equal(snapshot.rows.length, 1);
  assert.equal(snapshot.rows[0].date, "2026-10-01");
  assert.equal(snapshot.rows[0].crashRate28dUserWeighted, "0.0012");
  assert.equal(snapshot.rows[0].anrRate28dUserWeighted, "0.0021");
  assert.equal(snapshot.syncedAt, "2026-10-02T21:00:00.000Z");
});

test("drops malformed dates and unsupported metrics instead of persisting them", () => {
  const parsed = parseGooglePlayQualityMetricRows({ rows: [
    { startTime: { year: 2026, month: 2, day: 30 }, metrics: [{ metric: "crashRate28dUserWeighted", decimalValue: "0.1" }] },
    { startTime: { year: 2026, month: 2, day: 28 }, metrics: [{ metric: "notAllowed", decimalValue: "4" }] },
  ] }, ["crashRate28dUserWeighted"]);
  assert.equal(parsed.size, 0);
});

test("turns a reporting-scope denial into a reconnect instruction", async () => {
  await assert.rejects(fetchGooglePlayQualitySnapshot({
    packageName: "com.example.game",
    accessToken: "old-scope-token",
    fetcher: async () => new Response(JSON.stringify({ error: { message: "insufficient scope" } }), { status: 403, headers: { "content-type": "application/json" } }),
  }), /Reconnect this product’s Google Play account to grant reporting access/);
});
