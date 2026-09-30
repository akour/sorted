import assert from "node:assert/strict";
import test from "node:test";
import { analyzeGooglePlayListing } from "../lib/google-play-aso.ts";

test("accepts exact Google Play field limits and marks authenticated provenance", () => {
  const checks = analyzeGooglePlayListing({
    fetchSource: "google-play-api",
    title: "A".repeat(30),
    shortDescription: "B".repeat(80),
    longDescription: "C".repeat(4_000),
  });

  assert.deepEqual(checks.map((check) => check.status), ["pass", "pass", "pass", "pass"]);
});

test("flags missing or over-limit copy and labels public-page data as unverified", () => {
  const checks = analyzeGooglePlayListing({
    fetchSource: "public-store-page",
    title: "A".repeat(31),
    shortDescription: "",
    longDescription: "A public page snapshot",
  });

  assert.deepEqual(checks.map((check) => check.status), ["verify", "attention", "attention", "pass"]);
  assert.match(checks[0]?.detail ?? "", /preview/);
  assert.match(checks[1]?.detail ?? "", /over the limit/);
  assert.match(checks[2]?.detail ?? "", /Missing/);
});
