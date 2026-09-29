import assert from "node:assert/strict";
import test from "node:test";
import { extractGooglePlayLongDescription } from "../lib/product-icons.ts";

test("extracts the complete nested Google Play description instead of the short summary", () => {
  const shortDescription = "A relaxing cosmic journey, one block at a time.";
  const html = `<div jsname="bN97Pc"><div class="wZRcn">How high can you build your tower? Reach for the stars and beyond in Void Stack: Space Stack Game, the ultimate relaxing tower building experience.<br><br><b>BUILD THE PERFECT TOWER</b><br>Every tap counts. Challenge your timing and focus as you construct an endless block tower.<br><br><b>PLAY OFFLINE ANYWHERE</b><br>No Wi-Fi? No problem. Void Stack is a fully offline tower game.</div></div>`;

  const description = extractGooglePlayLongDescription(html, shortDescription);

  assert.match(description, /BUILD THE PERFECT TOWER/);
  assert.match(description, /PLAY OFFLINE ANYWHERE/);
  assert.notEqual(description, shortDescription);
});

test("extracts Google Play descriptions embedded in escaped page data", () => {
  const html = `<script>window.data = [[null,"How high can you build your tower?\\u003cbr\\u003e\\u003cbr\\u003eBUILD THE PERFECT TOWER\\u003cbr\\u003eEvery tap counts. Challenge your timing and focus as you construct an endless block tower.\\u003cbr\\u003e\\u003cbr\\u003ePLAY OFFLINE ANYWHERE\\u003cbr\\u003eNo Wi-Fi? No problem. Void Stack is a fully offline tower game."]]</script>`;

  const description = extractGooglePlayLongDescription(html, "A relaxing cosmic journey, one block at a time.");

  assert.match(description, /BUILD THE PERFECT TOWER/);
  assert.match(description, /PLAY OFFLINE ANYWHERE/);
});
