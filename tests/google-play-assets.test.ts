import assert from "node:assert/strict";
import test from "node:test";
import { getYouTubeVideoId, validateGooglePlayAssetSet, validateGooglePlayImageAsset } from "../lib/google-play-assets.ts";

const review = { uniqueToEvent: true, noAddedTextOrUi: true, safeZoneReviewed: true };

test("validates the primary 1920x1080 image and a 1:1 square image", () => {
  assert.deepEqual(validateGooglePlayImageAsset("primary", { fileName: "primary.jpg", mimeType: "image/jpeg", width: 1920, height: 1080, sizeBytes: 500_000, editorialChecks: review }), []);
  assert.deepEqual(validateGooglePlayImageAsset("square", { fileName: "square.png", mimeType: "image/png", width: 1024, height: 1024, sizeBytes: 500_000, pngBitDepth: 8, pngColorType: 2, editorialChecks: review }), []);
});

test("rejects incorrect dimensions, non-24-bit PNGs, and incomplete editorial review", () => {
  assert.match(validateGooglePlayImageAsset("primary", { fileName: "small.jpg", mimeType: "image/jpeg", width: 1280, height: 720, sizeBytes: 300_000, editorialChecks: review }).join(" "), /exactly 1920/);
  assert.match(validateGooglePlayImageAsset("square", { fileName: "alpha.png", mimeType: "image/png", width: 800, height: 800, sizeBytes: 300_000, pngBitDepth: 8, pngColorType: 6, editorialChecks: review }).join(" "), /24-bit/);
  assert.match(validateGooglePlayImageAsset("square", { fileName: "rect.jpg", mimeType: "image/jpeg", width: 800, height: 600, sizeBytes: 300_000, editorialChecks: review }).join(" "), /1:1 aspect ratio/);
  assert.match(validateGooglePlayImageAsset("primary", { fileName: "unchecked.jpg", mimeType: "image/jpeg", width: 1920, height: 1080, sizeBytes: 300_000 }).join(" "), /not reused/);
});

test("accepts standard YouTube video links and requires the video readiness checklist", () => {
  assert.equal(getYouTubeVideoId("https://youtu.be/abcdefghijk"), "abcdefghijk");
  assert.equal(getYouTubeVideoId("https://www.youtube.com/watch?v=abcdefghijk"), "abcdefghijk");
  assert.equal(getYouTubeVideoId("https://example.com/watch?v=abcdefghijk"), null);
  const errors = validateGooglePlayAssetSet({ video: { url: "https://youtu.be/abcdefghijk" } });
  assert.match(errors.join(" "), /public or unlisted/);
  assert.match(errors.join(" "), /monetization\/ads/);
});
