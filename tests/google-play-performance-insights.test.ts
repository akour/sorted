import assert from "node:assert/strict";
import test from "node:test";
import { buildPlayPerformanceRows, parsePlayConsoleCsv, suggestPlayPerformanceMapping } from "../lib/google-play-performance.ts";
import { chooseNextAsoStep, findOverlappingPromotions, summarizeLocaleObservations } from "../lib/google-play-performance-insights.ts";

function rowsFrom(csv: string) {
  const parsed = parsePlayConsoleCsv(csv);
  return buildPlayPerformanceRows(parsed.headers, parsed.rows, suggestPlayPerformanceMapping(parsed.headers)).rows;
}

test("shows the exact latest observation per locale without aggregating dates", () => {
  const observations = summarizeLocaleObservations(rowsFrom("Date,Locale,Visitors,Unique install clicks,CTR\n2026-09-01,en-US,100,10,10%\n2026-09-02,en-US,120,15,12.5%\n2026-09-02,fr-FR,60,4,6.7%"));
  assert.equal(observations.length, 2);
  assert.equal(observations[0].locale, "en-US");
  assert.equal(observations[0].rows, 2);
  assert.equal(observations[0].latestDate, "2026-09-02");
  assert.equal(observations[0].latest?.visitors, 120);
  assert.equal(observations[0].latest?.ctr, "12.5%");
  assert.equal(observations[1].latest?.installClicks, 4);
});

test("does not combine same-locale rows for the latest report date", () => {
  const observations = summarizeLocaleObservations(rowsFrom("Date,Locale,Search term,Unique install clicks\n2026-09-02,en-US,puzzle,10\n2026-09-02,en-US,stack,12"));
  assert.equal(observations[0].ambiguous, true);
  assert.equal(observations[0].latest, null);
});

test("matches product promotions by inclusive date overlap only", () => {
  const promotions = [
    { id: 1, title: "Launch", eventType: "feature", status: "planned", startDate: "2026-09-01", endDate: "2026-09-04" },
    { id: 2, title: "After", eventType: "offer", status: "live", startDate: "2026-09-11", endDate: "2026-09-12" },
    { id: 3, title: "Undated", eventType: "feature", status: "planned", startDate: "", endDate: "" },
  ];
  assert.deepEqual(findOverlappingPromotions(promotions, "2026-09-04", "2026-09-10").map((item) => item.title), ["Launch"]);
  assert.deepEqual(findOverlappingPromotions(promotions, "2026-09-40", "2026-09-50"), []);
});

test("continues an active ASO experiment before suggesting a different change", () => {
  const opportunities = [
    { title: "Improve FAQ", area: "AEO", status: "open" },
    { title: "Refresh screenshots", area: "ASO", status: "open" },
  ];
  const running = { opportunityTitle: "Title test", opportunityArea: "ASO", hypothesis: "", metric: "unique-install-clicks", locale: "en-US", status: "running", startDate: "2026-09-01" };
  assert.equal(chooseNextAsoStep(opportunities, [running]).kind, "active-experiment");
  const next = chooseNextAsoStep(opportunities, []);
  assert.equal(next.kind, "saved-opportunity");
  if (next.kind === "saved-opportunity") assert.equal(next.opportunity.title, "Refresh screenshots");
});
