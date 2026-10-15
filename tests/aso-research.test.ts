import assert from "node:assert/strict";
import test from "node:test";
import { normalizeKeywords } from "../lib/keyword-research.ts";
import { keywordOccurrences, parseDescriptionReview } from "../lib/aso-description.ts";

test("manual ASO observations survive normalization and unknown values stay null",()=>{
  const [keyword] = normalizeKeywords([{phrase:"habit tracker",volume:0,difficulty:42,rank:3,relevance:5,priority:"high",metricSource:"Provider score 0–100",metricDate:"2026-10-15",country:"Jordan"}]);
  assert.equal(keyword.volume,0); assert.equal(keyword.difficulty,42); assert.equal(keyword.rank,3); assert.equal(keyword.metricSource,"Provider score 0–100");
  const [unknown] = normalizeKeywords([{phrase:"routine",volume:"",difficulty:101,rank:0,relevance:6}]);
  assert.equal(unknown.volume,null); assert.equal(unknown.rank,null); assert.equal(unknown.difficulty,null); assert.equal(unknown.relevance,null);
});
test("phrase highlighting respects word boundaries, punctuation and Unicode",()=>{
  assert.equal(keywordOccurrences("Runner running run. RUN!", "run").length,2);
  assert.equal(keywordOccurrences("habit\ntracker and habit tracker", "habit tracker").length,2);
  assert.equal(keywordOccurrences("تتبع العادات", "العادات").length,1);
  assert.equal(keywordOccurrences("C++ puzzle", "C++").length,1);
  assert.equal(keywordOccurrences("anything", "").length,0);
});
test("invalid or over-limit AI rewrites cannot be used",()=>{
  const review={summary:"Review",keywords:[{phrase:"puzzle",priority:"high",reason:"Core mechanic"}],recommendations:[],suggestedDescription:"A puzzle game."};
  assert.ok(parseDescriptionReview(JSON.stringify(review)));
  assert.equal(parseDescriptionReview(JSON.stringify({...review,suggestedDescription:"a".repeat(4001)})),null);
  assert.equal(parseDescriptionReview(JSON.stringify({...review,keywords:[{phrase:"x",priority:"made-up"}]})),null);
});
