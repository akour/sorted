import assert from "node:assert/strict";
import test from "node:test";
import {
  isGooglePlayExperimentOutcome,
  validateGooglePlayExperimentDraft,
} from "../lib/google-play-experiments.ts";

const validDraft = {
  field: "shortDescription",
  hypothesis: "A clearer core benefit may help users decide to install.",
  baseline: "A current description that accurately explains this mobile game.",
  variant: "A quick stacking puzzle for satisfying play in short sessions.",
  fetchSource: "google-play-api",
};

test("accepts a valid experiment based on the authenticated current listing", () => {
  assert.equal(validateGooglePlayExperimentDraft(validDraft), null);
});

test("requires an authenticated baseline rather than public-page preview text", () => {
  assert.match(validateGooglePlayExperimentDraft({ ...validDraft, fetchSource: "public-store-page" }) ?? "", /connected Google Play account/);
});

test("rejects an unchanged or over-limit short description", () => {
  assert.match(validateGooglePlayExperimentDraft({ ...validDraft, variant: validDraft.baseline }) ?? "", /must differ/);
  assert.match(validateGooglePlayExperimentDraft({ ...validDraft, variant: "x".repeat(81) }) ?? "", /80 characters/);
});

test("rejects an over-limit full description and invalid outcome values", () => {
  assert.match(validateGooglePlayExperimentDraft({ ...validDraft, field: "fullDescription", variant: "x".repeat(4_001) }) ?? "", /4,000 characters/);
  assert.equal(isGooglePlayExperimentOutcome("variant_better"), true);
  assert.equal(isGooglePlayExperimentOutcome("invented_winner"), false);
});
