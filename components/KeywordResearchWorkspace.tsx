"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, CircleAlert, Eye, Lightbulb, Plus, SearchCheck, Sparkles, Trash2 } from "lucide-react";
import { emptyKeywordResearch, keywordId, type KeywordCandidate, type KeywordIntent, type KeywordPlacement, type KeywordResearch, type KeywordStatus } from "../lib/keyword-research";

type Product = { id: number; name: string; type: string };
type KeywordResponse = { research?: KeywordResearch; observed?: KeywordCandidate[]; error?: string; method?: string };

function createManualCandidate(phrase = ""): KeywordCandidate {
  return { id: keywordId(phrase), phrase, intent: "core", status: "shortlist", placement: "not-planned", source: "Manual", rationale: "" };
}

export function KeywordResearchWorkspace({ product, onOpenListing }: { product: Product; onOpenListing: () => void }) {
  const [research, setResearch] = useState<KeywordResearch>(() => emptyKeywordResearch(product.id));
  const [observed, setObserved] = useState<KeywordCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newPhrase, setNewPhrase] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/products/${product.id}/keywords`, { cache: "no-store", signal: controller.signal });
        const data = await response.json() as KeywordResponse;
        if (!response.ok) throw new Error(data.error ?? "Could not load keyword research.");
        if (!controller.signal.aborted) {
          setResearch(data.research ?? emptyKeywordResearch(product.id));
          setObserved(data.observed ?? []);
          setError("");
        }
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load keyword research.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [product.id]);

  const counts = useMemo(() => ({
    candidates: research.keywords.length,
    shortlisted: research.keywords.filter((item) => item.status === "shortlist").length,
    placed: research.keywords.filter((item) => item.placement !== "not-planned").length,
    observed: observed.length,
  }), [observed.length, research.keywords]);

  function updateKeyword(id: string, patch: Partial<KeywordCandidate>) {
    setResearch((current) => ({ ...current, keywords: current.keywords.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  }

  function removeKeyword(id: string) {
    setResearch((current) => ({ ...current, keywords: current.keywords.filter((item) => item.id !== id) }));
  }

  function addPhrase() {
    const phrase = newPhrase.replace(/\s+/g, " ").trim();
    if (!phrase) return;
    if (research.keywords.some((item) => item.phrase.localeCompare(phrase, undefined, { sensitivity: "accent" }) === 0)) {
      setError("That phrase is already in your research.");
      return;
    }
    setResearch((current) => ({ ...current, keywords: [...current.keywords, createManualCandidate(phrase)] }));
    setNewPhrase("");
    setError("");
  }

  function addObserved(candidate: KeywordCandidate) {
    setResearch((current) => ({ ...current, keywords: [...current.keywords, candidate] }));
    setObserved((current) => current.filter((item) => item.id !== candidate.id));
  }

  async function save(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(`/api/products/${product.id}/keywords`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(research) });
      const data = await response.json() as KeywordResponse;
      if (!response.ok) throw new Error(data.error ?? "Could not save keyword research.");
      setResearch(data.research ?? research);
      setObserved(data.observed ?? observed);
      setMessage("Keyword research saved. Nothing has been published to Google Play.");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save keyword research.");
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    setGenerating(true);
    try {
      const response = await fetch(`/api/products/${product.id}/keywords/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seedTerms: research.seedTerms, market: research.market }) });
      const data = await response.json() as KeywordResponse;
      if (!response.ok) throw new Error(data.error ?? "Could not generate keyword candidates.");
      setResearch(data.research ?? research);
      setMessage(`${data.method === "starter hypotheses" ? "Starter hypotheses added" : "Keyword candidates added"}. Review every phrase before using it in your listing.`);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not generate keyword candidates.");
    } finally {
      setGenerating(false);
    }
  }

  return <section className="keyword-research-workspace">
    <div className="keyword-heading">
      <div><p className="eyebrow">ASO research</p><h2>Keyword research</h2><p>Turn the language people use into a small, defensible keyword plan for {product.name}.</p></div>
      <div className="keyword-heading-actions"><button type="button" className="secondary-button" onClick={onOpenListing}><ArrowUpRight size={16} /> Open store listing</button><button type="button" className="primary-button" onClick={() => void generate()} disabled={loading || generating}><Sparkles size={16} /> {generating ? "Finding candidates…" : "Generate candidates"}</button></div>
    </div>

    <div className="keyword-disclosure"><CircleAlert size={18} /><p><strong>Research, not made-up metrics.</strong> Sorted only calls a term “observed” when it appears in an imported Play Console report. Every other phrase is a hypothesis to review; no volume, difficulty, or ranking is guessed.</p></div>
    {error && <div className="error-banner keyword-banner" role="alert">{error}</div>}
    {message && <div className="notice keyword-banner" role="status"><Check size={16} /> {message}</div>}

    <div className="keyword-metrics" aria-label="Keyword research summary">
      <KeywordMetric value={counts.candidates} label="Candidates" detail="Saved phrases" />
      <KeywordMetric value={counts.shortlisted} label="Shortlisted" detail="Ready to evaluate" />
      <KeywordMetric value={counts.placed} label="Mapped" detail="Planned in listing" />
      <KeywordMetric value={counts.observed} label="Observed" detail="From Play reports" />
    </div>

    <form className="keyword-layout" onSubmit={(event) => void save(event)}>
      <div className="keyword-main">
        <section className="keyword-panel keyword-setup">
          <div className="keyword-panel-heading"><div><p className="eyebrow">Start with product truth</p><h3>Research inputs</h3><p>Seeds help create useful candidates. They can be a user problem, feature, category, or phrase from a support conversation.</p></div><SearchCheck size={22} /></div>
          <div className="keyword-input-grid">
            <label>Market and language<select value={research.market} onChange={(event) => setResearch((current) => ({ ...current, market: event.target.value }))}><option value="en-US">English (United States)</option><option value="en-GB">English (United Kingdom)</option><option value="ar">Arabic</option><option value="es-419">Spanish (Latin America)</option><option value="pt-BR">Portuguese (Brazil)</option><option value="de-DE">German</option><option value="fr-FR">French</option><option value="ja-JP">Japanese</option><option value="ko-KR">Korean</option><option value="id">Indonesian</option></select></label>
            <label>Seed phrases<textarea value={research.seedTerms.join("\n")} onChange={(event) => setResearch((current) => ({ ...current, seedTerms: event.target.value.split(/\n|,/).map((term) => term.trim()).filter(Boolean) }))} rows={3} placeholder="relaxing stacking game&#10;quick mobile puzzle&#10;offline space game" /></label>
          </div>
        </section>

        <section className="keyword-panel keyword-map-panel">
          <div className="keyword-panel-heading"><div><p className="eyebrow">Decide deliberately</p><h3>Keyword map</h3><p>Keep only language you can support in the product and listing. Map a phrase to one place; avoid repeating it everywhere.</p></div><button className="keyword-add-button" type="button" onClick={addPhrase}><Plus size={16} /> Add phrase</button></div>
          <div className="keyword-quick-add"><input value={newPhrase} onChange={(event) => setNewPhrase(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addPhrase(); } }} placeholder="Add a phrase you want to evaluate" aria-label="New keyword phrase" /><button type="button" className="secondary-button" onClick={addPhrase}>Add</button></div>
          {loading ? <p className="loading-line">Loading keyword research…</p> : research.keywords.length ? <div className="keyword-table" role="table" aria-label="Keyword candidates">
            <div className="keyword-table-header" role="row"><span>Phrase</span><span>Intent</span><span>Status</span><span>Listing use</span><span>Why keep it?</span><span className="sr-only">Remove</span></div>
            {research.keywords.map((keyword) => <div className={`keyword-row keyword-${keyword.status}`} role="row" key={keyword.id}>
              <input value={keyword.phrase} onChange={(event) => updateKeyword(keyword.id, { phrase: event.target.value, id: keywordId(event.target.value) })} aria-label="Keyword phrase" />
              <select value={keyword.intent} onChange={(event) => updateKeyword(keyword.id, { intent: event.target.value as KeywordIntent })} aria-label={`Intent for ${keyword.phrase}`}><option value="core">Core need</option><option value="feature">Feature</option><option value="problem">Problem</option><option value="audience">Audience</option></select>
              <select value={keyword.status} onChange={(event) => updateKeyword(keyword.id, { status: event.target.value as KeywordStatus })} aria-label={`Status for ${keyword.phrase}`}><option value="shortlist">Shortlist</option><option value="tracking">Track</option><option value="used">Used</option><option value="avoid">Avoid</option></select>
              <select value={keyword.placement} onChange={(event) => updateKeyword(keyword.id, { placement: event.target.value as KeywordPlacement })} aria-label={`Listing use for ${keyword.phrase}`}><option value="not-planned">Not in listing</option><option value="title">Title</option><option value="short-description">Short description</option><option value="long-description">Full description</option></select>
              <input value={keyword.rationale} onChange={(event) => updateKeyword(keyword.id, { rationale: event.target.value })} placeholder={keyword.source === "Play Console" ? "Observed term — confirm relevance" : "Reason to evaluate this phrase"} aria-label={`Rationale for ${keyword.phrase}`} />
              <button type="button" className="keyword-remove" onClick={() => removeKeyword(keyword.id)} aria-label={`Remove ${keyword.phrase}`}><Trash2 size={16} /></button>
              <small className="keyword-source">{keyword.source}</small>
            </div>)}
          </div> : <div className="keyword-empty"><Lightbulb size={22} /><div><strong>Start with a few useful phrases</strong><p>Add seeds above, generate candidates, or enter a phrase you hear from customers. Keywords remain editable and unpublished.</p></div></div>}
        </section>

        <section className="keyword-panel keyword-notes"><label><span><Eye size={16} /> Research notes <small>optional</small></span><textarea value={research.notes} onChange={(event) => setResearch((current) => ({ ...current, notes: event.target.value }))} rows={3} placeholder="What did you learn from reviews, support, competitors, or your product team?" /></label></section>
        <div className="keyword-save-bar"><span>{research.updatedAt ? "Changes are saved only when you press Save." : "Nothing has been saved yet."}</span><button type="submit" className="primary-button" disabled={loading || saving || generating}>{saving ? "Saving…" : "Save keyword research"}</button></div>
      </div>

      <aside className="keyword-sidebar">
        <section className="keyword-side-card"><p className="eyebrow">How to use this</p><h3>From phrase to listing decision</h3><ol><li><div><b>Collect</b><span>Language from the product, users, and reports.</span></div></li><li><div><b>Prioritize</b><span>What clearly matches a real intent.</span></div></li><li><div><b>Place</b><span>One message where it earns its place.</span></div></li><li><div><b>Measure</b><span>Changes with Play Console before deciding what worked.</span></div></li></ol></section>
        <section className="keyword-side-card keyword-policy"><p className="eyebrow">Google Play guardrail</p><h3>Natural language wins</h3><p>Do not turn descriptions into repeated word lists. Keep every phrase relevant, accurate, and understandable to a person deciding whether to install.</p></section>
        {observed.length > 0 && <section className="keyword-side-card keyword-observed"><p className="eyebrow">From Play Console</p><h3>Observed search terms</h3><p>These terms appeared in an imported performance report. They are not automatically good targets.</p><div>{observed.map((candidate) => <button type="button" key={candidate.id} onClick={() => addObserved(candidate)}><span>{candidate.phrase}</span><Plus size={15} /></button>)}</div></section>}
      </aside>
    </form>
  </section>;
}

function KeywordMetric({ value, label, detail }: { value: number; label: string; detail: string }) {
  return <div className="keyword-metric"><strong>{String(value).padStart(2, "0")}</strong><span>{label}</span><small>{detail}</small></div>;
}
