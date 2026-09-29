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
  assert.doesNotMatch(description, /inert>|<div class=/);
});

test("keeps descriptions tied to the requested Google Play app", () => {
  const html = `<script>AF_initDataCallback({data:[["Void Stack: Space Stack Game","com.oneapps.voidstack","How high can you build your tower? Reach for the stars and beyond.\\u003cbr\\u003eBUILD THE PERFECT TOWER\\u003cbr\\u003eEvery tap counts as you construct an endless block tower in a relaxing cosmic journey."]]})</script><script>AF_initDataCallback({data:[["Vertical Mayhem","com.quanticbit.verticalmayhem","Rule the heights and survive the chaos.\\u003cbr\\u003eVERTICAL ACTION"]]})</script>`;

  const description = extractGooglePlayLongDescription(html, "A relaxing cosmic journey, one block at a time.", {
    appId: "com.oneapps.voidstack",
    title: "Void Stack: Space Stack Game",
  });

  assert.match(description, /BUILD THE PERFECT TOWER/);
  assert.doesNotMatch(description, /Vertical Mayhem|VERTICAL ACTION/);
});
