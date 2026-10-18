import assert from "node:assert/strict";
import test from "node:test";
import {compareListingPeriods,type OutcomeRow} from "../lib/listing-outcomes.ts";
const scope={locale:"en-US",country:"US",trafficSource:"Search"};
const a={start:"2026-10-01",end:"2026-10-02"},b={start:"2026-10-03",end:"2026-10-04"};
const row=(date:string,count:number|null):OutcomeRow=>({date,...scope,searchTerm:"",installClicks:count,openClicks:null,preRegistrationClicks:null,sourceRow:Number(date.slice(-2))});
test("compares complete matched daily observations, preserving source rows",()=>{const r=compareListingPeriods([row(a.start,10),row(a.end,20)],[row(b.start,20),row(b.end,40)],scope,"unique-install-clicks",a,b);assert.equal(r.baseline.mean,15);assert.equal(r.comparison.mean,30);assert.equal(r.relativeChange,100);assert.deepEqual(r.baseline.sourceRows,[1,2]);});
test("zero baseline stays zero but percentage is undefined",()=>{const r=compareListingPeriods([row(a.start,0),row(a.end,0)],[row(b.start,1),row(b.end,1)],scope,"unique-install-clicks",a,b);assert.equal(r.relativeChange,null);});
test("missing days, null metrics, duplicates and mismatched scope cannot masquerade as evidence",()=>{
 const validB=[row(b.start,5),row(b.end,7)];
 for(const rows of [[row(a.start,2)],[row(a.start,null),row(a.end,3)],[row(a.start,2),row(a.start,3),row(a.end,4)],[{...row(a.start,1),country:"GB"},row(a.end,4)],[{...row(a.start,1),searchTerm:"game"},row(a.end,4)]])assert.throws(()=>compareListingPeriods(rows,validB,scope,"unique-install-clicks",a,b));
});
test("overlapping, invalid and unequal date windows are rejected",()=>{for(const next of [{start:a.end,end:b.start},{start:"2026-02-30",end:b.end},{start:b.start,end:b.start}])assert.throws(()=>compareListingPeriods([],[],scope,"unique-install-clicks",a,next));});
