"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowUpRight, Check, Eye, FileSearch, Lightbulb, ListChecks, MessageSquareQuote, Plus, RefreshCw, SearchCheck, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { competitorNoteId, emptyKeywordResearch, keywordId, type CompetitorNote, type KeywordCandidate, type KeywordResearch, type KeywordSource } from "../lib/keyword-research";
import { AsoKeywordTable } from "./AsoKeywordTable";
import { AsoDescriptionWorkbench } from "./AsoDescriptionWorkbench";
import "./aso-research.css";

type Product = { id: number; name: string; type: string };
type ListingText = { title: string; shortDescription: string; longDescription: string };
type ListingEvidence = { current: ListingText; draft: ListingText };
type ReviewLanguage = { text: string; rating: number | null; language: string };
type KeywordResponse = { research?: KeywordResearch; observed?: KeywordCandidate[]; listing?: ListingEvidence; error?: string; method?: string };
type ReviewResponse = { reviews?: ReviewLanguage[]; error?: string };

const blankListing: ListingEvidence = { current: { title: "", shortDescription: "", longDescription: "" }, draft: { title: "", shortDescription: "", longDescription: "" } };
const manualSources: Array<{ value: KeywordSource; label: string }> = [
  { value: "Manual", label: "Manual hypothesis" },
  { value: "Review language", label: "Review or support language" },
  { value: "Competitor note", label: "Competitor observation" },
];

function sourceRationale(source: KeywordSource) {
  if (source === "Review language") return "Language captured from a customer review or support conversation. Shorten it to an accurate, natural phrase before using it in metadata.";
  if (source === "Competitor note") return "A manual competitor messaging observation. Confirm the phrase fits this product; do not copy claims or brand terms.";
  return "A manual hypothesis to validate against the product and future Play Console results.";
}

function createCandidate(phrase: string, source: KeywordSource = "Manual"): KeywordCandidate {
  return { id: keywordId(phrase), phrase, intent: "core", status: "shortlist", placement: "not-planned", source, rationale: sourceRationale(source) };
}

function matches(phrase: string, field: string) {
  const normalizedPhrase = phrase.toLocaleLowerCase().replace(/\s+/g, " ").trim();
  return normalizedPhrase.length > 1 && field.toLocaleLowerCase().replace(/\s+/g, " ").includes(normalizedPhrase);
}

function fieldsFor(phrase: string, listing: ListingText) {
  return [
    ["Title", listing.title],
    ["Short description", listing.shortDescription],
    ["Full description", listing.longDescription],
  ].flatMap(([label, value]) => matches(phrase, value) ? [label] : []);
}

export function KeywordResearchWorkspace({ product, onOpenListing }: { product: Product; onOpenListing: () => void }) {
  const isGame = /game/i.test(product.type);
  const [workspaceTab, setWorkspaceTab] = useState<"keywords" | "description">("keywords");
  const [research, setResearch] = useState<KeywordResearch>(() => emptyKeywordResearch(product.id));
  const [observed, setObserved] = useState<KeywordCandidate[]>([]);
  const [listing, setListing] = useState<ListingEvidence>(blankListing);
  const [reviews, setReviews] = useState<ReviewLanguage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [building, setBuilding] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [newPhrase, setNewPhrase] = useState("");
  const [newPhraseSource, setNewPhraseSource] = useState<KeywordSource>("Manual");
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
          setListing(data.listing ?? blankListing);
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

  const coverage = research.keywords.map((keyword) => ({ keyword, current: fieldsFor(keyword.phrase, listing.current), draft: fieldsFor(keyword.phrase, listing.draft) }));
  const counts = {
    candidates: research.keywords.length,
    evidence: research.keywords.filter((item) => ["Play Console", "Review language", "Competitor note"].includes(item.source)).length,
    mapped: research.keywords.filter((item) => item.placement !== "not-planned").length,
    covered: coverage.filter((item) => item.current.length > 0 || item.draft.length > 0).length,
  };
  const hasListingEvidence = Object.values(listing.current).some(Boolean) || Object.values(listing.draft).some(Boolean);
  const nextKeyword = research.keywords.find((item) => item.status === "shortlist" && item.placement !== "not-planned") ?? research.keywords.find((item) => item.status === "shortlist");

  function updateKeyword(id: string, patch: Partial<KeywordCandidate>) {
    setResearch((current) => ({ ...current, keywords: current.keywords.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  }

  function removeKeyword(id: string) {
    setResearch((current) => ({ ...current, keywords: current.keywords.filter((item) => item.id !== id) }));
  }

  function addPhrase() {
    const phrase = newPhrase.replace(/\s+/g, " ").trim();
    if (!phrase) return;
    if (phrase.length > 80) {
      setError("Keep a research phrase to 80 characters or fewer. Capture the full review in notes instead.");
      return;
    }
    if (research.keywords.some((item) => item.phrase.localeCompare(phrase, undefined, { sensitivity: "accent" }) === 0)) {
      setError("That phrase is already in your research.");
      return;
    }
    setResearch((current) => ({ ...current, keywords: [...current.keywords, createCandidate(phrase, newPhraseSource)] }));
    setNewPhrase("");
    setError("");
  }

  function addObserved(candidate: KeywordCandidate) {
    setResearch((current) => ({ ...current, keywords: [...current.keywords, candidate] }));
    setObserved((current) => current.filter((item) => item.id !== candidate.id));
  }

  function addCompetitor() {
    setResearch((current) => ({ ...current, competitors: [...current.competitors, { id: competitorNoteId(`competitor-${current.competitors.length + 1}`), name: "", url: "", observation: "" }] }));
  }

  function updateCompetitor(id: string, patch: Partial<CompetitorNote>) {
    setResearch((current) => ({ ...current, competitors: current.competitors.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  }

  function removeCompetitor(id: string) {
    setResearch((current) => ({ ...current, competitors: current.competitors.filter((item) => item.id !== id) }));
  }

  function prepareReviewPhrase(text: string) {
    setNewPhrase(text.slice(0, 80));
    setNewPhraseSource("Review language");
    setMessage("Review wording is ready below. Edit it into a concise phrase before adding it to the map.");
  }

  async function loadReviews() {
    setReviewsLoading(true);
    try {
      const response = await fetch(`/api/products/${product.id}/keywords/reviews`, { method: "POST" });
      const data = await response.json() as ReviewResponse;
      if (!response.ok) throw new Error(data.error ?? "Could not read review language.");
      setReviews(data.reviews ?? []);
      setMessage(data.reviews?.length ? "Recent reviews loaded as read-only evidence. They are not stored in Sorted." : "Google Play returned no written reviews for this product.");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read review language.");
    } finally {
      setReviewsLoading(false);
    }
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
      setListing(data.listing ?? listing);
      setMessage("Free research saved. Nothing has been published to Google Play.");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save keyword research.");
    } finally {
      setSaving(false);
    }
  }

  async function buildStarterSet() {
    setBuilding(true);
    try {
      const response = await fetch(`/api/products/${product.id}/keywords/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seedTerms: research.seedTerms, market: research.market, freeMode: true }) });
      const data = await response.json() as KeywordResponse;
      if (!response.ok) throw new Error(data.error ?? "Could not build starter phrases.");
      setResearch(data.research ?? research);
      setMessage("Starter hypotheses added from this product’s existing brief and seed phrases. No AI call or market-data provider was used.");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not build starter phrases.");
    } finally {
      setBuilding(false);
    }
  }

  return <section className="keyword-research-workspace">
    <div className="keyword-heading">
      <div><p className="eyebrow">Google Play · {isGame ? "Game" : "App"} ASO</p><h2>Google Play keyword research</h2><p>Find phrases people would use to discover {product.name} in the store. Choose a language, validate relevance, then place natural wording in the title, short description, or full description.</p><p>These phrases target one store listing—not website pages. Website queries and page planning live separately in Website SEO. Apple uses its own listing and keyword field in Store ASO.</p></div>
      <div className="keyword-heading-actions"><button type="button" className="secondary-button" onClick={onOpenListing}><ArrowUpRight size={16} /> Open store listing</button><button type="button" className="primary-button" onClick={() => void buildStarterSet()} disabled={loading || building}><Sparkles size={16} /> {building ? "Building starter set…" : "Build starter set"}</button></div>
    </div>

    <div className="keyword-disclosure"><ShieldCheck size={18} /><p><strong>Your ASO research desk.</strong> Build a keyword list, record manual volume, difficulty and rank observations, then review your description. Market metrics stay blank until you enter them; the description review uses Sorted’s configured AI.</p></div>
    {error && <div className="error-banner keyword-banner" role="alert">{error}</div>}
    {message && <div className="notice keyword-banner" role="status"><Check size={16} /> {message}</div>}

    <div className="keyword-metrics" aria-label="Keyword research summary">
      <KeywordMetric value={counts.candidates} label="Candidates" detail="Saved phrases" />
      <KeywordMetric value={counts.evidence} label="Evidence-led" detail="Play, reviews, competitors" />
      <KeywordMetric value={counts.mapped} label="Mapped" detail="Planned in listing" />
      <KeywordMetric value={counts.covered} label="Covered" detail="Found in a saved listing" />
    </div>

    <div className="aso-workspace-tabs" role="tablist" aria-label="ASO research tools"><button type="button" role="tab" id="aso-keywords-tab" aria-controls="aso-keywords-panel" aria-selected={workspaceTab === "keywords"} onClick={() => setWorkspaceTab("keywords")}>Keyword research</button><button type="button" role="tab" id="aso-description-tab" aria-controls="aso-description-panel" aria-selected={workspaceTab === "description"} onClick={() => setWorkspaceTab("description")}>Description studio <Sparkles size={14}/></button></div>
    <div id="aso-keywords-panel" role="tabpanel" aria-labelledby="aso-keywords-tab" hidden={workspaceTab !== "keywords"}>
    <form className="keyword-layout" onSubmit={(event) => void save(event)}>
      <div className="keyword-main">
        <section className="keyword-panel keyword-setup">
          <div className="keyword-panel-heading"><div><p className="eyebrow">Start with product truth</p><h3>{isGame ? "How would players find this game?" : "What task does your app help with?"}</h3><p>{isGame ? "Start with genre, mechanics, theme, and play style. Only include claims such as offline play when the game supports them." : "Start with the user's problem, core task, useful features, and audience—not blog topics."} Seed phrases are hypotheses, not search-volume claims.</p></div><SearchCheck size={22} /></div>
          <div className="keyword-input-grid">
            <label>Market and language<select value={research.market} onChange={(event) => setResearch((current) => ({ ...current, market: event.target.value }))}><option value="en-US">English (United States)</option><option value="en-GB">English (United Kingdom)</option><option value="ar">Arabic</option><option value="es-419">Spanish (Latin America)</option><option value="pt-BR">Portuguese (Brazil)</option><option value="de-DE">German</option><option value="fr-FR">French</option><option value="ja-JP">Japanese</option><option value="ko-KR">Korean</option><option value="id">Indonesian</option></select></label>
            <label>Store search phrases<textarea value={research.seedTerms.join("\n")} onChange={(event) => setResearch((current) => ({ ...current, seedTerms: event.target.value.split(/\n|,/).map((term) => term.trim()).filter(Boolean) }))} rows={3} placeholder={isGame ? "relaxing stacking game\nspace puzzle\narcade runner" : "daily habit tracker\nroutine planner\nhabit reminders"} /></label>
          </div>
        </section>

        <section className="keyword-panel keyword-evidence-panel">
          <div className="keyword-panel-heading"><div><p className="eyebrow">First-party evidence</p><h3>Recent Google Play review language</h3><p>Read the latest written reviews from this connected product. Choose a useful phrase yourself; review text is displayed only and is never stored by Sorted.</p></div><button type="button" className="secondary-button" onClick={() => void loadReviews()} disabled={reviewsLoading}>{reviewsLoading ? <RefreshCw className="keyword-spin" size={16} /> : <MessageSquareQuote size={16} />} {reviewsLoading ? "Reading reviews…" : "Read recent reviews"}</button></div>
          {reviews.length ? <div className="keyword-review-list">{reviews.map((review, index) => <article key={`${review.text}-${index}`}><div><span className="keyword-review-meta">{review.rating ? `${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}` : "Review"}{review.language ? ` · ${review.language}` : ""}</span><p>{review.text}</p></div><button type="button" className="text-button" onClick={() => prepareReviewPhrase(review.text)}>Use wording</button></article>)}</div> : <div className="keyword-evidence-empty"><MessageSquareQuote size={20} /><span>Connect Google Play, then read recent reviews here. This uses your existing connection and adds no paid service.</span></div>}
        </section>

        <section className="keyword-panel keyword-map-panel">
          <div className="keyword-panel-heading"><div><p className="eyebrow">Research & prioritize</p><h3>Keyword workspace</h3><p>Compare relevant phrases, enter market observations, and choose the keywords to test in your listing. Manage each row’s evidence and listing placement.</p></div><button className="keyword-add-button" type="button" onClick={addPhrase}><Plus size={16} /> Add phrase</button></div>
          <div className="keyword-quick-add"><input value={newPhrase} onChange={(event) => setNewPhrase(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addPhrase(); } }} placeholder="Add a phrase you want to evaluate" aria-label="New keyword phrase" /><select value={newPhraseSource} onChange={(event) => setNewPhraseSource(event.target.value as KeywordSource)} aria-label="Evidence source">{manualSources.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}</select><button type="button" className="secondary-button" onClick={addPhrase}>Add</button></div>
          {loading ? <p className="loading-line">Loading keyword research…</p> : research.keywords.length ? <AsoKeywordTable keywords={research.keywords} update={updateKeyword} remove={removeKeyword} /> : <div className="keyword-empty"><Lightbulb size={22} /><div><strong>Build your keyword list</strong><p>Add keywords, enter manual market observations, and prioritize the phrases you want to test.</p></div></div>}
        </section>

        <section className="keyword-panel keyword-coverage-panel">
          <div className="keyword-panel-heading"><div><p className="eyebrow">Listing coverage</p><h3>Check the copy you already have</h3><p>Each phrase is checked against saved current listing text and any saved draft. This is coverage, not proof of search ranking or relevance.</p></div><FileSearch size={22} /></div>
          {hasListingEvidence && coverage.length ? <ul className="keyword-coverage-list">{coverage.map(({ keyword, current, draft }) => <li key={keyword.id}><strong>{keyword.phrase}</strong><span><b>Current</b>{current.length ? current.join(" · ") : "Not present"}</span><span><b>Draft</b>{draft.length ? draft.join(" · ") : "Not present"}</span></li>)}</ul> : <div className="keyword-evidence-empty"><FileSearch size={20} /><span>{hasListingEvidence ? "Add a phrase to the map, then this check will show where it already appears in your saved listing." : "Save or refresh the product’s store listing first, then this check will show where each phrase already appears."}</span>{!hasListingEvidence && <button type="button" className="text-button" onClick={onOpenListing}>Open store listing →</button>}</div>}
        </section>

        <section className="keyword-panel keyword-competitor-panel">
          <div className="keyword-panel-heading"><div><p className="eyebrow">Manual comparison</p><h3>Competitor messaging notes</h3><p>Capture what a competing listing promises or emphasizes. Do not copy their claims, use their brand terms, or assume their ranks.</p></div><button className="keyword-add-button" type="button" onClick={addCompetitor}><Plus size={16} /> Add note</button></div>
          {research.competitors.length ? <div className="keyword-competitor-list">{research.competitors.map((competitor) => <article key={competitor.id}><div className="keyword-competitor-fields"><input value={competitor.name} onChange={(event) => updateCompetitor(competitor.id, { name: event.target.value, id: competitorNoteId(event.target.value) })} placeholder="App or competitor name" aria-label="Competitor name" /><input value={competitor.url} onChange={(event) => updateCompetitor(competitor.id, { url: event.target.value })} placeholder="Optional public listing URL" aria-label={`Listing URL for ${competitor.name || "competitor"}`} /><textarea value={competitor.observation} onChange={(event) => updateCompetitor(competitor.id, { observation: event.target.value })} placeholder="What language, user problem, or positioning did you observe?" rows={2} aria-label={`Observation for ${competitor.name || "competitor"}`} /></div><button type="button" className="keyword-remove" onClick={() => removeCompetitor(competitor.id)} aria-label={`Remove ${competitor.name || "competitor note"}`}><Trash2 size={16} /></button></article>)}</div> : <div className="keyword-evidence-empty"><Eye size={20} /><span>Add only competitors you actually reviewed. These are your observations, not automated market intelligence.</span></div>}
        </section>

        <section className="keyword-panel keyword-notes"><label><span><Eye size={16} /> Research notes <small>optional</small></span><textarea value={research.notes} onChange={(event) => setResearch((current) => ({ ...current, notes: event.target.value }))} rows={3} placeholder="What did you learn from reviews, support, competitors, or your product team?" /></label></section>
        <div className="keyword-save-bar"><span>{research.updatedAt ? "Changes are saved only when you press Save." : "Nothing has been saved yet."}</span><button type="submit" className="primary-button" disabled={loading || saving || building}>{saving ? "Saving…" : "Save free research"}</button></div>
      </div>

      <aside className="keyword-sidebar">
        <section className="keyword-side-card keyword-test-card"><p className="eyebrow">Next test</p><h3>Change one message, then measure</h3>{nextKeyword ? <><strong>{nextKeyword.phrase}</strong><p>Plan this in Store listing with one placement, one locale, and one Play Console metric. The shared experiment tracker stays the source of truth.</p><button type="button" className="secondary-button" onClick={onOpenListing}><ListChecks size={16} /> Plan a listing test</button></> : <p>Shortlist a phrase, map it to a listing field, then plan one measured change in Store listing.</p>}</section>
        <section className="keyword-side-card"><p className="eyebrow">How to use this</p><h3>From phrase to listing decision</h3><ol><li><div><b>Collect</b><span>Language from your product, customers, and Play reports.</span></div></li><li><div><b>Prioritize</b><span>What clearly matches a real user intent.</span></div></li><li><div><b>Place</b><span>One message where it earns its place.</span></div></li><li><div><b>Measure</b><span>Changes with Play Console before deciding what worked.</span></div></li></ol></section>
        <section className="keyword-side-card keyword-policy"><p className="eyebrow">Google Play guardrail</p><h3>Natural language wins</h3><p>Do not turn descriptions into repeated word lists. Keep every phrase relevant, accurate, and understandable to a person deciding whether to install.</p></section>
        {observed.length > 0 && <section className="keyword-side-card keyword-observed"><p className="eyebrow">From Play Console</p><h3>Observed search terms</h3><p>These terms appeared in an imported performance report. They are not automatically good targets.</p><div>{observed.map((candidate) => <button type="button" key={candidate.id} onClick={() => addObserved(candidate)}><span>{candidate.phrase}</span><Plus size={15} /></button>)}</div></section>}
      </aside>
    </form>
    </div>
    <div id="aso-description-panel" role="tabpanel" aria-labelledby="aso-description-tab" hidden={workspaceTab !== "description"}>
    {!loading && <AsoDescriptionWorkbench productId={product.id} market={research.market} keywords={research.keywords} current={listing.current.longDescription} draft={listing.draft.longDescription} onAdd={candidate => { setResearch(value => ({...value, keywords: value.keywords.some(k => k.phrase.toLowerCase() === candidate.phrase.toLowerCase()) ? value.keywords : [...value.keywords, candidate]})); setMessage("Keyword added to your list. Save keyword research to keep it."); }} />}
    </div>
  </section>;
}

function KeywordMetric({ value, label, detail }: { value: number; label: string; detail: string }) {
  return <div className="keyword-metric"><strong>{String(value).padStart(2, "0")}</strong><span>{label}</span><small>{detail}</small></div>;
}
