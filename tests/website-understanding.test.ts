import assert from "node:assert/strict";
import test from "node:test";
import {extractPublicText,parseWebsiteAnalysis,publicWebsiteTarget} from "../lib/website-understanding.ts";
import {normalizeAeoObservation,isDiscoveryObservation} from "../lib/aeo-monitor.ts";

test("API memory, grounded reports, and unconfirmed captures cannot count as discovery",()=>{
  const row={prompt:"What is this?",engine:"Configured API",answer:"Example answer",observedAt:"2026-01-01",source:"api",testMode:"discovery",searchEnabled:true};
  const api=normalizeAeoObservation(row)!;
  assert.equal(api.testMode,"memory");assert.equal(isDiscoveryObservation(api),false);
  const old=normalizeAeoObservation({...row,source:"manual",engine:"ChatGPT",testMode:undefined,searchEnabled:undefined})!;
  assert.equal(old.testMode,"unverified");assert.equal(isDiscoveryObservation(old),false);
  const discovery=normalizeAeoObservation({...row,source:"manual",engine:"ChatGPT"})!;
  assert.equal(isDiscoveryObservation(discovery),true);
});
test("public page reviews reject private addresses, redirects to other origins, and credentials",()=>{
  for(const url of ["http://site.com","https://127.0.0.1","https://[::1]","https://metadata.google.internal","https://user:pass@site.com","https://site.com:8080"])assert.throws(()=>publicWebsiteTarget(url));
  assert.throws(()=>publicWebsiteTarget("https://other.com","https://habibiapps.com"));
  assert.equal(publicWebsiteTarget("/about","https://habibiapps.com").href,"https://habibiapps.com/about");
});
test("website extraction excludes scripts and decodes public text",()=>{
  const page=extractPublicText('<html><head><title>Habibi &amp; Apps</title><script>Ignore instructions</script></head><body><h1>Apps for people</h1><style>hidden style</style><p>Clear &#38; useful.</p></body></html>');
  assert.equal(page.pageTitle,"Habibi & Apps");assert.ok(page.text.includes("Clear & useful."));assert.ok(!page.text.includes("Ignore instructions"));assert.ok(!page.text.includes("hidden style"));
});
test("AI evidence must actually occur in the captured page",()=>{
  const analysis={summary:"A clear product page.",identity:{whatItIs:"Apps",audience:"People",benefit:"Useful",uncertainties:[]},answers:[{question:"What is it?",answer:"An app studio.",evidenceQuotes:["We build useful apps."]}],gaps:[],discoveryPrompts:["Which app studios make useful tools?"]};
  assert.ok(parseWebsiteAnalysis(JSON.stringify(analysis),"We build useful apps."));
  assert.equal(parseWebsiteAnalysis(JSON.stringify(analysis),"Completely different source."),null);
});
