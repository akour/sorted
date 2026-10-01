import assert from "node:assert/strict";
import test from "node:test";
import {
  GOOGLE_PLAY_TARGET_LOCALES,
  listingSourceFingerprint,
  parseLocalizedStoreListings,
  validateGooglePlayListingText,
  validateLocalizedStoreListings,
} from "../lib/google-play-localizations.ts";
import { publishGooglePlayListingsWithAccessToken } from "../lib/google-play.ts";

test("the ten priority target locales are unique and exclude the English source", () => {
  const locales = GOOGLE_PLAY_TARGET_LOCALES.map((item) => item.locale);
  assert.equal(locales.length, 10);
  assert.equal(new Set(locales).size, 10);
  assert.equal(locales.includes("en-US" as never), false);
});

test("source fingerprints change only when listing copy changes", () => {
  const listing = { title: "Void Stack", shortDescription: "Build a stack", fullDescription: "A puzzle game." };
  assert.equal(listingSourceFingerprint(listing), listingSourceFingerprint({ ...listing }));
  assert.notEqual(listingSourceFingerprint(listing), listingSourceFingerprint({ ...listing, fullDescription: "A different game." }));
});

test("Google Play listing limits are validated before save or publish", () => {
  assert.deepEqual(validateGooglePlayListingText({ title: "", shortDescription: "x".repeat(81), fullDescription: "x".repeat(4001) }), [
    "App title is required.",
    "Short description exceeds Google Play's 80-character limit.",
    "Full description exceeds Google Play's 4,000-character limit.",
  ]);
});

test("localized records are parsed defensively and invalid or duplicate rows are not published", () => {
  const good = { locale: "ar", title: "لعبة", shortDescription: "وصف", fullDescription: "شرح", sourceHash: "abc", status: "ready" };
  const rows = validateLocalizedStoreListings([good, good, { ...good, locale: "xx" }, { ...good, title: "x".repeat(31) }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "ready");
  assert.equal(parseLocalizedStoreListings(JSON.stringify(rows))[0].locale, "ar");
  assert.deepEqual(parseLocalizedStoreListings("not json"), []);
});

test("publishing stages all locales, validates the edit, then commits once", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : undefined });
    return new Response(JSON.stringify(url.endsWith("/edits") ? { id: "edit-1" } : {}), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await publishGooglePlayListingsWithAccessToken("test-token", "com.example.app", [
      { language: "en-US", title: "Example", shortDescription: "A short listing", fullDescription: "A full listing." },
      { language: "ar", title: "مثال", shortDescription: "وصف قصير", fullDescription: "وصف كامل." },
    ]);
    assert.deepEqual(result.publishedLocales, ["en-US", "ar"]);
    assert.deepEqual(calls.map((call) => call.method), ["POST", "PUT", "PUT", "POST", "POST"]);
    assert.ok(calls[3].url.endsWith(":validate"));
    assert.ok(calls[4].url.endsWith(":commit"));
    assert.deepEqual(JSON.parse(calls[2].body ?? "{}"), { title: "مثال", shortDescription: "وصف قصير", fullDescription: "وصف كامل." });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a failed validation deletes the uncommitted Play edit", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (url.endsWith("/edits")) return new Response(JSON.stringify({ id: "edit-2" }), { status: 200, headers: { "content-type": "application/json" } });
    if (url.endsWith(":validate")) return new Response(JSON.stringify({ error: { message: "Listing validation failed." } }), { status: 400, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await assert.rejects(publishGooglePlayListingsWithAccessToken("test-token", "com.example.app", [
      { language: "en-US", title: "Example", shortDescription: "A short listing", fullDescription: "A full listing." },
    ]), /Listing validation failed/);
    assert.ok(calls.some((call) => call.method === "DELETE" && call.url.includes("/edits/edit-2")));
    assert.equal(calls.some((call) => call.url.endsWith(":commit")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
