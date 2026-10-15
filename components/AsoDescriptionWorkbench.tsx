"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { keywordId, type KeywordCandidate } from "@/lib/keyword-research";
import { keywordOccurrences, PLAY_DESCRIPTION_GUIDANCE, type DescriptionReview } from "@/lib/aso-description";

export function AsoDescriptionWorkbench({ productId, market, keywords, current, draft, onAdd }: { productId:number; market:string; keywords:KeywordCandidate[]; current:string; draft:string; onAdd:(keyword:KeywordCandidate)=>void }) {
  const [text,setText] = useState(draft || current);
  const [review,setReview] = useState<DescriptionReview | null>(null);
  const [reviewedText,setReviewedText] = useState("");
  const [selected,setSelected] = useState("");
  const [busy,setBusy] = useState(false);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const phrases = review?.keywords || keywords.filter(k => k.status !== "avoid").map(k => ({phrase:k.phrase,priority:k.priority || "medium",reason:k.rationale}));
  const occurrences = keywordOccurrences(text,selected);
  const stale = Boolean(review && reviewedText !== text);
  const endpoint = `/api/products/${productId}/keywords/description`;
  async function analyze() {
    setBusy(true);setError("");setMessage("");
    const submitted = text;
    try {
      const response = await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({description:submitted,market,keywords:keywords.map(k=>k.phrase)})});
      const data = await response.json() as {review?:DescriptionReview;error?:string};
      if (!response.ok) throw new Error(data.error || "Could not review the description.");
      if (!data.review) throw new Error("The AI returned an incomplete review. Please retry.");
      setReview(data.review);setReviewedText(submitted);setSelected(data.review.keywords[0]?.phrase || "");
    } catch(e) {setError(e instanceof Error ? e.message : "Review failed.");} finally {setBusy(false);}
  }
  async function save() {
    setSaving(true);setError("");setMessage("");
    try {
      const response = await fetch(endpoint,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({description:text})});
      const data = await response.json() as {error?:string};
      if (!response.ok) throw new Error(data.error || "Could not save draft.");
      setMessage("Saved to this product's Google Play full-description draft in Store ASO. Nothing has been published.");
    } catch(e) {setError(e instanceof Error ? e.message : "Save failed.");} finally {setSaving(false);}
  }
  return <section className="keyword-panel aso-description-workbench"><div className="keyword-panel-heading"><div><p className="eyebrow">Google Play · Description studio</p><h3>Turn keywords into readable copy</h3><p>Review the current listing or draft, see which phrases matter, and refine the description before saving it to Store ASO.</p></div><button type="button" className="primary-button" disabled={busy || !text.trim()} onClick={() => void analyze()}><Sparkles size={16}/>{busy ? "Reviewing description…" : "Review with AI"}</button></div>
    <div className="aso-description-grid"><div><div className="aso-table-tools"><button type="button" className="secondary-button" disabled={!current || busy} onClick={()=>{setText(current);setMessage("");}}>Load current listing</button><button type="button" className="secondary-button" disabled={!draft || busy} onClick={()=>{setText(draft);setMessage("");}}>Load saved draft</button><span className={text.length > 4000 ? "aso-limit-error" : ""}>{text.length.toLocaleString()} / 4,000 characters</span></div><label className="aso-description-label" htmlFor="aso-description-editor">Full description · {market}</label><textarea id="aso-description-editor" value={text} maxLength={12000} rows={16} disabled={busy || saving} placeholder="Load your listing or paste a full description to review…" onChange={e=>{setText(e.target.value);setMessage("");}} />
    {selected && <div className="aso-description-preview"><h4>Phrase in context: {selected} · {occurrences.length} matches</h4><div>{occurrences.length ? <>{occurrences.map((m,i)=><span key={m.start}>{text.slice(i ? occurrences[i-1].end : 0,m.start)}<mark>{text.slice(m.start,m.end)}</mark></span>)}{text.slice(occurrences.at(-1)!.end)}</> : text || "No description yet."}</div></div>}
    <div className="aso-table-tools"><button type="button" className="primary-button" disabled={busy || saving || !text.trim() || text.length > 4000} onClick={()=>void save()}>{saving ? "Saving…" : "Save full-description draft"}</button><small>Publish separately from Store ASO after review.</small></div></div>
    <aside className="aso-description-insights"><h4>{review ? "AI keyword priorities" : "Your research keywords"}</h4><p>Click a phrase to highlight its exact matches. Counts update as you edit; they are a writing aid, not a ranking score.</p>{phrases.length ? phrases.map((k,i)=><article key={`${k.phrase}-${i}`}><button type="button" className={`aso-keyword-chip ${selected === k.phrase ? "is-selected" : ""}`} onClick={()=>setSelected(k.phrase)}><strong>{k.phrase}</strong><span>{k.priority} · {keywordOccurrences(text,k.phrase).length} matches</span></button><p>{k.reason}</p>{review && <button type="button" className="text-button" disabled={keywords.some(v=>v.phrase.toLowerCase()===k.phrase.toLowerCase())} onClick={()=>onAdd({id:keywordId(k.phrase),phrase:k.phrase,priority:k.priority,intent:"core",status:"shortlist",placement:"long-description",source:"AI suggestion",rationale:k.reason})}>{keywords.some(v=>v.phrase.toLowerCase()===k.phrase.toLowerCase()) ? "In keyword list" : "Add to keyword list"}</button>}</article>) : <p>Run the AI review to identify relevant phrases, or add research keywords above.</p>}</aside></div>
    {stale && <p role="status" className="notice">The copy has changed since the AI review. Run it again for updated recommendations.</p>}
    {review && <div className="aso-review-results"><h4>Description review</h4><p>{review.summary}</p>{review.recommendations.map((r,i)=><article key={i}><small>{r.kind === "policy-risk" ? "Potential policy risk · verify" : "Editorial recommendation"}</small><strong>{r.issue}</strong><p>{r.action}</p></article>)}<details><summary>Compare suggested rewrite</summary><p>Check every feature and claim before using this suggestion.</p><div className="aso-description-preview">{review.suggestedDescription}</div><button type="button" className="secondary-button" disabled={busy} onClick={()=>{setText(review.suggestedDescription);setMessage("Suggested rewrite loaded into the editor. Review it, then save the draft.");}}>Use rewrite in editor</button><button type="button" className="text-button" onClick={()=>setText(reviewedText)}>Restore reviewed version</button></details></div>}
    <div className="aso-guidance"><strong>Google Play guidance · reviewed {PLAY_DESCRIPTION_GUIDANCE.reviewedOn}</strong><p>Keep metadata accurate and relevant; avoid repetitive keyword blocks. The full description allows 4,000 characters. There is no published target keyword density or spacing rule. AI flags require human review and do not certify policy compliance.</p><a href={PLAY_DESCRIPTION_GUIDANCE.metadataUrl} target="_blank" rel="noreferrer">Metadata policy ↗</a> · <a href={PLAY_DESCRIPTION_GUIDANCE.listingUrl} target="_blank" rel="noreferrer">Listing field limits ↗</a></div>
    {error && <p role="alert" className="error-banner">{error}</p>}{message && <p role="status" className="notice">{message}</p>}
  </section>;
}
