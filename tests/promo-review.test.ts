import assert from "node:assert/strict";
import { test } from "node:test";
import { promoReviewErrors, selectedPromoCopy } from "../lib/promo-review";

const event = () => ({ productId: 1, title: "October challenge", startDate: "2026-10-14", endDate: "2026-11-01", eventBrief: { whatNew: "A community challenge using existing routines." }, googlePlay: { options: [{ tagline: "Build a routine", description: "Join a month of existing routines." }], selectedOption: 0 }, localization: [] });

test("Google Play review does not require Apple, website, creative or duplicate English", () => {
  assert.deepEqual(promoReviewErrors(event()), []);
});
test("selected copy supports legacy data and a single manually authored option", () => {
  assert.equal(selectedPromoCopy(event()).tagline, "Build a routine");
  assert.equal(selectedPromoCopy({ googlePlay: { tagline: "Legacy", description: "Saved copy" } }).tagline, "Legacy");
});
test("dates and field limits are checked", () => {
  const draft = event();
  draft.endDate = "2026-10-01";
  draft.googlePlay.options[0].tagline = "a".repeat(81);
  assert.equal(promoReviewErrors(draft).length, 2);
});
test("empty optional locales do not block handoff", () => {
  assert.deepEqual(promoReviewErrors({ ...event(), localization: [{ locale: "ar", tagline: "", description: "", status: "draft" }] }), []);
});
test("translations need review and matching English source", () => {
  const draft = event();
  const locale = { locale: "ar", tagline: "روتين", description: "روتين يومي", status: "draft" };
  assert.equal(promoReviewErrors({ ...draft, localization: [locale] }).length, 2);
  const reviewed = { ...locale, status: "ready", sourceTagline: draft.googlePlay.options[0].tagline, sourceDescription: draft.googlePlay.options[0].description };
  assert.deepEqual(promoReviewErrors({ ...draft, localization: [reviewed] }), []);
  draft.googlePlay.options[0].description = "Updated English";
  assert.match(promoReviewErrors({ ...draft, localization: [reviewed] })[0], /current English/);
});
test("unconfirmed legacy proposals are flagged", () => {
  assert.match(promoReviewErrors({ ...event(), eventBrief: { whatNew: "Proposal to confirm: new rewards" } })[0], /unconfirmed/);
});
