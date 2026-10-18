"use client";

import {useEffect,useState} from "react";
import {Sparkles} from "lucide-react";
import type {DescriptionReview} from "@/lib/aso-description";
import {keywordOccurrences} from "@/lib/aso-description";
import type {KeywordCandidate} from "@/lib/keyword-research";

/** Works on the listing's existing draft; never maintains a second editable copy. */
export function ListingDescriptionReview({productId,text,disabled,onChange,onBusyChange}:{productId:number;text:string;disabled:boolean;onChange:(text:string)=>void;onBusyChange:(busy:boolean)=>void}) {
  const [keywords,setKeywords]=useState<KeywordCandidate[]>([]);
  const [evidence,setEvidence]=useState("Loading saved keyword evidence…");
  const [review,setReview]=useState<DescriptionReview|null>(null);
  const [reviewed,setReviewed]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [undo,setUndo]=useState<{before:string;after:string}|null>(null);
  useEffect(()=>{const controller=new AbortController();fetch(`/api/products/${productId}/keywords`,{signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error();const data=await r.json() as {research?:{market:string;keywords:KeywordCandidate[]}};const research=data.research;if(research?.market!=="en-US"){setEvidence("Your saved research uses another locale. This English review will not reuse those phrases.");return;}setKeywords((research.keywords||[]).filter((k:KeywordCandidate)=>k.status!=="avoid"));setEvidence("Saved English keyword research · relevance hypotheses, not proven demand.");}).catch(()=>{if(!controller.signal.aborted)setEvidence("Keyword research could not be loaded. You can still review the copy without it.");});return()=>controller.abort();},[productId]);
  async function analyze(){const submitted=text;setBusy(true);onBusyChange(true);setError("");try{const r=await fetch(`/api/products/${productId}/keywords/description`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({description:submitted,market:"en-US",keywords:keywords.map(k=>k.phrase)}),signal:AbortSignal.timeout(135000)});const data=await r.json() as {review?:DescriptionReview;error?:string};if(!r.ok||!data.review)throw new Error(data.error||"The review could not be completed.");setReview(data.review);setReviewed(submitted);}catch(e){setError(e instanceof Error?e.message:"Review failed.");}finally{setBusy(false);onBusyChange(false);}}
  const stale=Boolean(review&&reviewed!==text);
  return <section className="listing-description-review" aria-label="Description review"><div className="listing-editor-toolbar"><div><h3>Improve this description</h3><p>Review the copy above, choose a change, then save the same listing draft.</p></div><button type="button" className="secondary-button ai-action-button" disabled={disabled||busy||!text.trim()} onClick={()=>void analyze()}><Sparkles size={16}/>{busy?"Reviewing…":"Review description with AI"}</button></div>
    <p>{evidence}</p>{keywords.length>0&&<div className="listing-keyword-evidence">{keywords.slice(0,8).map(k=><span key={k.id}>{k.phrase} · {keywordOccurrences(text,k.phrase).length} exact matches</span>)}</div>}
    <p className="field-help">Counts are writing aids—not ranking targets. AI recommendations require factual and policy review.</p>
    {error&&<p role="alert" className="error-banner">{error}</p>}
    {review&&<><p>{review.summary}</p>{stale&&<p role="status">The draft has changed. Review again before applying this suggestion.</p>}{review.recommendations.map((r,i)=><article key={i}><small>{r.kind==="policy-risk"?"Potential policy risk · verify":"Editorial suggestion"}</small><strong>{r.issue}</strong><p>{r.action}</p></article>)}<details><summary>Compare suggested description</summary><div className="listing-review-comparison"><div><strong>Reviewed draft</strong><p>{reviewed}</p></div><div><strong>AI suggestion · check every claim</strong><p>{review.suggestedDescription}</p></div></div><button type="button" className="secondary-button" disabled={disabled||busy||stale||!review.suggestedDescription||review.suggestedDescription.length>4000} onClick={()=>{setUndo({before:text,after:review.suggestedDescription});onChange(review.suggestedDescription);}}>Use suggestion in listing draft</button></details></>}
    {undo&&text===undo.after&&<button type="button" className="text-button" disabled={disabled||busy} onClick={()=>{onChange(undo.before);setUndo(null);}}>Undo suggested change</button>}
    <p className="field-help">Nothing is saved or sent by this review. Use Save draft, then Review & send.</p>
  </section>;
}
