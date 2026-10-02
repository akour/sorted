import assert from "node:assert/strict";
import test from "node:test";
import { getPublishReadiness } from "../lib/publish-readiness";

const validOptimization = {
  storeTitle: "Void Stack: Space Stack Game",
  storeSubtitle: "",
  storeShortDescription: "A relaxing cosmic journey, one block at a time.",
  storeLongDescription: "Void Stack is a calm one-touch stacking game. Build a tower one block at a time, travel through changing space scenes, and try to beat your personal high score. The controls are simple to learn, while accurate timing helps keep each new block aligned. Play offline whenever you want a short, focused game.",
  answerSummary: "Void Stack is a one-touch tower-stacking game with a space theme and offline play.",
  currentListing: {},
};

test("optimization readiness checks actual Play fields, not the internal hook", () => {
  const result = getPublishReadiness({ optimization: validOptimization });
  assert.equal(result.optimize, true);
});

test("a short or unchanged full description cannot make Optimize ready", () => {
  const short = getPublishReadiness({ optimization: { ...validOptimization, storeLongDescription: validOptimization.storeShortDescription } });
  const unchanged = getPublishReadiness({ optimization: { ...validOptimization, currentListing: { longDescription: validOptimization.storeLongDescription } } });
  assert.equal(short.optimize, false);
  assert.equal(unchanged.optimize, false);
});
