import assert from "node:assert/strict";
import test from "node:test";
import { extractGooglePlayLongDescription } from "../lib/product-icons.ts";

test("extracts the complete nested Google Play description instead of the short summary", () => {
  const shortDescription = "A relaxing cosmic journey, one block at a time.";
  const html = `<div itemprop="description"><div>How high can you build your tower? Reach for the stars and beyond in Void Stack: Space Stack Game, the ultimate relaxing tower building experience.</div><div><h3>BUILD THE PERFECT TOWER</h3><p>Every tap counts. Challenge your timing and focus as you construct an endless block tower.</p></div><div><h3>PLAY OFFLINE ANYWHERE</h3><p>No Wi-Fi? No problem. Void Stack is a fully offline tower game.</p></div></div>`;

  const description = extractGooglePlayLongDescription(html, shortDescription);

  assert.match(description, /BUILD THE PERFECT TOWER/);
  assert.match(description, /PLAY OFFLINE ANYWHERE/);
  assert.notEqual(description, shortDescription);
});
