import test from "node:test";
import assert from "node:assert/strict";
import { checkListing, EMPTY_LISTING, SAMPLE_LISTING } from "../lib/listing-checker.ts";
test("an empty or whitespace-only listing never passes", () => {
  assert.equal(checkListing(EMPTY_LISTING).withinLimits, false);
  assert.equal(checkListing({ title: " ", shortDescription: "\n", fullDescription: "\t" }).complete, false);
});
test("all three exact boundaries pass and one extra character fails", () => {
  const exact = { title: "a".repeat(30), shortDescription: "b".repeat(80), fullDescription: "c".repeat(4000) };
  assert.equal(checkListing(exact).withinLimits, true);
  for (const key of Object.keys(exact) as (keyof typeof exact)[]) {
    const result = checkListing({ ...exact, [key]: `${exact[key]}!` });
    assert.equal(result.withinLimits, false);
    assert.equal(result.fields.find(f => f.key === key)?.over, 1);
  }
});
test("Unicode counts match Sorted's existing conservative publishing validator", () => {
  assert.equal(checkListing({ ...SAMPLE_LISTING, title: "😀".repeat(16) }).fields[0].count, 32);
  assert.equal(checkListing({ ...SAMPLE_LISTING, title: "ع".repeat(30) }).withinLimits, true);
});
test("example passes length checks; editorial reminders do not claim policy approval", () => {
  assert.equal(checkListing(SAMPLE_LISTING).withinLimits, true);
  assert.ok(checkListing({ ...SAMPLE_LISTING, title: "BEST HABITS #1" }).notes.length >= 2);
});
