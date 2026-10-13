import test from "node:test";
import assert from "node:assert/strict";
import { productWorkspaceKind, productSectionAllowed } from "../lib/product-workspace";
import { buildApplicationSchema, emptyAnswerVisibility } from "../lib/answer-visibility";

test("website routes do not expose store tools, including old deep links", () => {
  const website = { type: "Website", url: "https://example.com" };
  for (const view of ["Optimize", "Keywords", "Results", "Connections"]) assert.equal(productSectionAllowed(website, view), false);
  for (const view of ["SEO", "Answers", "Settings"]) assert.equal(productSectionAllowed(website, view), true);
});
test("store URLs take precedence over legacy imported product type", () => {
  assert.equal(productWorkspaceKind({ type: "Website", url: "https://apps.apple.com/us/app/example/id1234" }), "app-store");
  assert.equal(productWorkspaceKind({ type: "Game", url: "https://play.google.com/store/apps/details?id=com.example.game" }), "google-play");
  assert.equal(productWorkspaceKind({ type: "Game", url: "https://example.com" }), "unselected-store");
});
test("Apple cannot enter Google publishing, reports or keyword workflows", () => {
  const apple = { type: "Mobile app", url: "https://apps.apple.com/us/app/example/id1234" };
  for (const view of ["Results", "Connections", "Keywords", "Calendar"]) assert.equal(productSectionAllowed(apple, view), false);
  assert.equal(productSectionAllowed(apple, "Optimize"), true);
});
test("website answer schema is not an Android application", () => {
  const schema = buildApplicationSchema({ id: 1, name: "Example", type: "Website", url: "https://example.com", position: "", audience: "" }, emptyAnswerVisibility(1));
  assert.match(schema, /"@type": "WebSite"/);
  assert.doesNotMatch(schema, /Android|MobileApplication/);
});
