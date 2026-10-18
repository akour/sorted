import assert from "node:assert/strict";
import test from "node:test";
import {comparePublicListing} from "../lib/listing-receipts.ts";
const expected={language:"en-US",title:"Example",shortDescription:"A short summary",fullDescription:"Full description.\nSecond paragraph."};
test("public verification requires all three fields and compares whitespace-normalized copy",()=>{
 assert.equal(comparePublicListing(expected,{title:"Example",shortDescription:"A short summary",longDescription:"Full description. Second paragraph."}),"match");
 for(const actual of [undefined,{}, {title:"Example",shortDescription:"A short summary"}])assert.equal(comparePublicListing(expected,actual),"unavailable");
});
test("changed titles, summaries and descriptions never count as a public match",()=>{
 const actual={title:expected.title,shortDescription:expected.shortDescription,longDescription:expected.fullDescription};
 for(const field of ["title","shortDescription","longDescription"] as const)assert.equal(comparePublicListing(expected,{...actual,[field]:"Different copy"}),"different");
});
