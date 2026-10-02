import assert from "node:assert/strict";
import test from "node:test";
import { getOptimizationDraftIssues } from "../lib/optimization-quality";

const baseDraft = {
  storeTitle: "Void Stack: Space Stack Game",
  storeSubtitle: "Relaxing offline space game",
  storeShortDescription: "A relaxing cosmic journey, one block at a time.",
  storeLongDescription: "Void Stack is a calm one-touch stacking game. Build a tower one block at a time, travel through changing space scenes, and try to beat your personal high score. The controls are simple to learn, while accurate timing helps keep each new block aligned. Play offline whenever you want a short, focused game.",
  answerSummary: "Void Stack is a one-touch tower-stacking game with a space theme and offline play.",
};

test("a complete, substantive optimization draft passes its content checks", () => {
  assert.deepEqual(getOptimizationDraftIssues(baseDraft), []);
});

test("a full description that only repeats the short hook is blocked", () => {
  const issues = getOptimizationDraftIssues({ ...baseDraft, storeLongDescription: baseDraft.storeShortDescription });
  assert.ok(issues.some((issue) => issue.field === "fullDescription" && issue.message.includes("only the short description")));
});

test("an unchanged full description cannot be marked as a new optimization", () => {
  const issues = getOptimizationDraftIssues({ ...baseDraft, currentListing: { longDescription: baseDraft.storeLongDescription } });
  assert.ok(issues.some((issue) => issue.field === "fullDescription" && issue.message.includes("unchanged from the current listing")));
});

test("a manual starter placeholder and internal verification notes are not accepted as final copy", () => {
  const issues = getOptimizationDraftIssues({
    ...baseDraft,
    storeTitle: "Clarify the product promise",
    answerSummary: "Void Stack is a game. Verify every store claim before publishing.",
  });
  assert.ok(issues.some((issue) => issue.field === "title" && issue.message.includes("placeholder")));
  assert.ok(issues.some((issue) => issue.field === "answerSummary" && issue.message.includes("verification reminder")));
});

test("full descriptions must fit Play's limit and include enough product detail", () => {
  const shortIssues = getOptimizationDraftIssues({ ...baseDraft, storeLongDescription: "Only a short hook." });
  assert.ok(shortIssues.some((issue) => issue.field === "fullDescription" && issue.message.includes("too short")));

  const longIssues = getOptimizationDraftIssues({ ...baseDraft, storeLongDescription: "A".repeat(4_001) });
  assert.ok(longIssues.some((issue) => issue.field === "fullDescription" && issue.message.includes("4,000-character limit")));
});
