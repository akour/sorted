import assert from "node:assert/strict";
import test from "node:test";
import {aeoProbeModels,AEO_WEB_ENGINES} from "../lib/aeo-collection.ts";
test("a selected model is probed alone, never silently substituted",()=>{
  assert.deepEqual(aeoProbeModels(["mimo","deepseek","qwen"],"deepseek"),["deepseek"]);
  assert.deepEqual(aeoProbeModels(["mimo","deepseek"],undefined),["mimo","deepseek"]);
});
test("unconfigured models cannot expand access or incur new model usage",()=>{
  assert.equal(aeoProbeModels(["mimo"],"unconfigured-paid-model"),null);
  assert.equal(aeoProbeModels(["mimo"],["mimo"]),null);
});
test("guided web collection opens normal provider websites",()=>{
  assert.equal(AEO_WEB_ENGINES.length,6);
  for (const engine of AEO_WEB_ENGINES) assert.equal(new URL(engine.url).protocol,"https:");
});
