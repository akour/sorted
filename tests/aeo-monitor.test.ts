import assert from "node:assert/strict";
import test from "node:test";
import { aeoMetrics, containsBrand, isOwnedCitation, normalizeAeoConfig, normalizeAeoObservation, safeAeoUrl, type AeoObservation } from "../lib/aeo-monitor.ts";

const answer=(patch:Partial<AeoObservation>={}):AeoObservation=>({promptId:"p1",prompt:"What is Sorted?",engine:"ChatGPT",source:"manual",model:"",answer:"Sorted is a workspace.",citations:[],evidenceUrl:"",identification:"unreviewed",notes:"",observedAt:"2026-01-01T00:00:00.000Z",language:"English",country:"",...patch});
test("missing AEO measurements are unknown, not zero",()=>{
  const metrics=aeoMetrics([],"Sorted","https://sort3d.space");
  assert.equal(metrics.mentionRate,null);assert.equal(metrics.recognitionRate,null);assert.equal(metrics.citationRate,null);
});
test("recognition requires a separate assessment, not just a name mention",()=>{
  const metrics=aeoMetrics([answer(),answer({answer:"Sorted is a moving company.",identification:"confused"}),answer({identification:"correct",citations:["https://sort3d.space/about"]})],"Sorted","https://sort3d.space");
  assert.equal(metrics.mentionRate,100);assert.equal(metrics.recognitionRate,50);assert.equal(metrics.reviewed,2);assert.equal(metrics.citationRate,33);
});
test("owned citations match domain boundaries and reject misleading domains",()=>{
  assert.ok(isOwnedCitation("https://docs.sort3d.space/a","https://sort3d.space"));
  assert.ok(!isOwnedCitation("https://sort3d.space.evil.com/a","https://sort3d.space"));
  assert.ok(!isOwnedCitation("https://notsort3d.space/a","https://sort3d.space"));
  assert.equal(safeAeoUrl("javascript:alert(1)"),"");
  assert.ok(!containsBrand("unsorted results","Sorted",""));
});
test("manual answer validation preserves provenance and rejects invalid dates",()=>{
  assert.equal(normalizeAeoObservation({...answer(),observedAt:"invalid"}),null);
  assert.equal(normalizeAeoObservation({...answer(),engine:"Imaginary engine"}),null);
  const parsed=normalizeAeoObservation({...answer(),citations:["javascript:alert(1)","https://sort3d.space","https://sort3d.space/"]});
  assert.equal(parsed?.citations.length,1);assert.equal(parsed?.identification,"unreviewed");
});
test("monitoring plan caps inputs and prevents duplicate prompt IDs",()=>{
  const config=normalizeAeoConfig({prompts:[{id:"p1",text:"Question"},{id:"p1",text:"Duplicate"}],competitors:["Brand","Brand","",3]});
  assert.equal(config.prompts.length,1);assert.deepEqual(config.competitors,["Brand"]);
});
