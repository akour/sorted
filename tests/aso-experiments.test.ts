import assert from "node:assert/strict";
import test from "node:test";
import { createOptimizationExperiment, parseOptimizationStorage, stringifyOptimizationStorage } from "../lib/aso-experiments";

test("older opportunity arrays remain readable without experiment data", () => {
  const opportunities = [{ title: "Improve the first impression", status: "open" }];
  assert.deepEqual(parseOptimizationStorage(JSON.stringify(opportunities)), { opportunities, experiments: [] });
});

test("experiment records round-trip separately from generated opportunities", () => {
  const experiment = { ...createOptimizationExperiment("Clarify the promise", "ASO", "test-1"), hypothesis: "A clearer promise will increase install clicks.", variant: "A clearer title", status: "running" as const };
  const stored = stringifyOptimizationStorage([{ title: "A regenerated recommendation" }], [experiment]);
  const parsed = parseOptimizationStorage(stored);
  assert.deepEqual(parsed.experiments, [experiment]);
  assert.equal(parsed.opportunities[0].title, "A regenerated recommendation");
});

test("unknown metrics and statuses are normalized rather than trusted", () => {
  const parsed = parseOptimizationStorage(JSON.stringify({ opportunities: [], experiments: [{ id: "x", opportunityTitle: "Test", metric: "ctr", status: "success" }] }));
  assert.equal(parsed.experiments[0].metric, "unique-install-clicks");
  assert.equal(parsed.experiments[0].status, "planned");
});
