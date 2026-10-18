import assert from "node:assert/strict";
import test from "node:test";
import {createListingChange,createOptimizationExperiment,parseOptimizationStorage,stringifyOptimizationStorage} from "../lib/aso-experiments.ts";

const input={before:"Original listing",after:"Proposed listing",baselineFetchedAt:"2026-10-13T12:00:00Z",reason:"Explain the mechanic earlier",keywords:"arena survival",measurementPlan:"Compare the same locale and traffic source in Play Console; record dates and uncertainty.",metric:"unique-install-clicks" as const};
test("change snapshots and measurement plans survive save and reload",()=>{
  const plan=createListingChange(input,"2026-10-18T12:00:00Z");
  const loaded=parseOptimizationStorage(stringifyOptimizationStorage([], [plan])).experiments[0];
  assert.deepEqual(loaded,plan);assert.equal(loaded.status,"planned");assert.equal(loaded.locale,"en-US");assert.equal(loaded.control,input.before);assert.equal(loaded.variant,input.after);assert.equal(loaded.startDate,"");
});
test("unchanged copy and incomplete plans cannot be captured",()=>{
  assert.throws(()=>createListingChange({...input,after:input.before}));
  assert.throws(()=>createListingChange({...input,reason:" "}));
  assert.throws(()=>createListingChange({...input,measurementPlan:""}));
});
test("legacy experiment history and opportunities are preserved",()=>{
  const legacy=createOptimizationExperiment("Existing experiment","Short description");
  const loaded=parseOptimizationStorage(stringifyOptimizationStorage([{title:"Existing recommendation"}],[legacy,createListingChange(input)]));
  assert.deepEqual(loaded.experiments[0],legacy);assert.equal(loaded.experiments.length,2);assert.equal(loaded.opportunities.length,1);
  assert.deepEqual(parseOptimizationStorage('[{"title":"Old recommendation"}]').experiments,[]);
});
