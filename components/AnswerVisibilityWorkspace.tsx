"use client";

import { hasWebsiteDestination } from "../lib/product-workspace";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, Clipboard, Code2, ExternalLink, FileText, Lightbulb, Link2, ListChecks, Plus, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { answerVisibilityScore, buildAnswerPageBrief, buildApplicationSchema, emptyAnswerVisibility, isPublicWebPage, starterAnswerCards, type AnswerCard, type AnswerFact, type AnswerVisibilityProfile } from "../lib/answer-visibility";
import { AeoVisibilityDashboard } from "./AeoVisibilityDashboard";

type Product = {
  id: number;
  name: string;
  type: string;
  url: string;
  websiteUrl?: string;
  googlePlayUrl?: string;
  appStoreUrl?: string;
  position: string;
  audience: string;
};

type AnswerResponse = { profile?: AnswerVisibilityProfile; error?: string };
type SuggestionResponse = { suggestion?: string; model?: string; fallbacksUsed?: number; error?: string };

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function answerIsBacked(answer: AnswerCard, facts: AnswerFact[]) {
  return Boolean(answer.answer.trim() && (answer.sourceUrl || facts.length));
}

type WorkspaceProps = { product:Product; onOpenListing:()=>void; onOpenSettings:()=>void };

export function AnswerVisibilityWorkspace(props:WorkspaceProps) {
  return <AeoVisibilityDashboard product={props.product} onOpenSeo={props.onOpenListing} onOpenSettings={props.onOpenSettings}><AnswerContentWorkspace {...props}/></AeoVisibilityDashboard>;
}

function AnswerContentWorkspace({ product, onOpenListing, onOpenSettings }: WorkspaceProps) {
  const isWebsite = hasWebsiteDestination(product);
  const savedWebsiteUrl = product.websiteUrl || (isPublicWebPage(product.url) ? product.url : "");
  const [profile, setProfile] = useState<AnswerVisibilityProfile>(() => emptyAnswerVisibility(product.id));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/products/${product.id}/answers`, { cache: "no-store", signal: controller.signal });
        const data = await response.json() as AnswerResponse;
        if (!response.ok) throw new Error(data.error ?? "Could not load answer visibility work.");
        if (!controller.signal.aborted) {
          setProfile(data.profile ?? emptyAnswerVisibility(product.id));
          setError("");
        }
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load answer visibility work.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [product.id]);

  const readiness = useMemo(() => answerVisibilityScore(product, profile), [product, profile]);
  const completedAnswers = profile.answers.filter((answer) => answer.answer.trim()).length;
  const evidenceBackedAnswers = profile.answers.filter((answer) => answerIsBacked(answer, profile.facts)).length;
  const hasSourcePage = isPublicWebPage(profile.primaryPageUrl);
  const schemaReady = hasSourcePage && Boolean(profile.primaryClaim.trim());
  const schema = useMemo(() => buildApplicationSchema(product, profile), [product, profile]);
  const pageBrief = useMemo(() => buildAnswerPageBrief(product, profile), [product, profile]);

  function goTo(target: "source" | "facts" | "answers" | "package") {
    document.getElementById(`answer-${target}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function useProductLink() {
    if (!isPublicWebPage(savedWebsiteUrl)) {
      setError("This product’s saved link is a store page or is not a public website. Add an owned product page in Product settings first.");
      return;
    }
    setProfile((current) => ({ ...current, primaryPageUrl: savedWebsiteUrl }));
    setError("");
    setMessage("The saved product website is ready to review as the canonical answer source. Save when you are happy with it.");
  }

  function updateFact(id: string, patch: Partial<AnswerFact>) {
    setProfile((current) => ({ ...current, facts: current.facts.map((fact) => fact.id === id ? { ...fact, ...patch } : fact) }));
  }

  function updateAnswer(id: string, patch: Partial<AnswerCard>) {
    setProfile((current) => ({ ...current, answers: current.answers.map((answer) => answer.id === id ? { ...answer, ...patch } : answer) }));
  }

  function addFact() {
    setProfile((current) => ({ ...current, facts: [...current.facts, { id: newId("fact"), statement: "", sourceUrl: "" }] }));
  }

  function addAnswer() {
    setProfile((current) => ({ ...current, answers: [...current.answers, { id: newId("answer"), question: "", answer: "", sourceUrl: "", status: "draft" }] }));
  }

  function addStarterAnswers() {
    const existingQuestions = new Set(profile.answers.map((answer) => answer.question.trim().toLocaleLowerCase()).filter(Boolean));
    const starters = starterAnswerCards(product).filter((answer) => !existingQuestions.has(answer.question.toLocaleLowerCase()));
    if (!starters.length) {
      setMessage("The three starter questions are already in this product’s answer set.");
      return;
    }
    setProfile((current) => ({ ...current, answers: [...current.answers, ...starters] }));
    setMessage("Starter questions added. Write only answers you can support with the product and public evidence.");
  }

  async function save(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(`/api/products/${product.id}/answers`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(profile) });
      const data = await response.json() as AnswerResponse;
      if (!response.ok) throw new Error(data.error ?? "Could not save answer visibility work.");
      setProfile(data.profile ?? profile);
      setMessage("Answer visibility work saved. Nothing has been published outside Sorted.");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save answer visibility work.");
    } finally {
      setSaving(false);
    }
  }

  async function suggestDirectAnswer() {
    setSuggesting(true);
    try {
      const response = await fetch(`/api/products/${product.id}/answers/suggest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await response.json() as SuggestionResponse;
      if (!response.ok || !data.suggestion) throw new Error(data.error ?? "Could not generate an answer suggestion.");
      setProfile((current) => ({ ...current, primaryClaim: data.suggestion ?? current.primaryClaim }));
      setMessage("A suggestion from Sort3d’s configured AI model was added to the editable draft. Review it against your source before saving.");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not generate an answer suggestion.");
    } finally {
      setSuggesting(false);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`${label} copied. Publish it only after the underlying page copy is accurate and visible to visitors.`);
      setError("");
    } catch {
      setError("Your browser could not copy that asset. Select the text below and copy it manually.");
    }
  }

  return <section className="answer-visibility-workspace">
    <div className="answer-heading">
      <div><p className="eyebrow">Website · AEO / GEO</p><h2>Answer visibility</h2><p>Make {product.name} easy to understand from one factual, public source—not by chasing a black-box score.</p></div>
      <div className="answer-heading-actions"><button type="button" className="secondary-button" onClick={onOpenListing}><ArrowUpRight size={16} /> {isWebsite ? "Open website SEO" : "Open store ASO"}</button><button type="button" className="secondary-button" onClick={onOpenSettings}><Link2 size={16} /> Product settings</button></div>
    </div>

    <div className="answer-disclosure"><ShieldCheck size={18} /><p><strong>AEO/GEO is a content and source-quality practice, not a citation hack.</strong> Build helpful, crawlable pages for people first. Any structured data must match the visible page, and no tool can promise inclusion in an answer engine.</p></div>
    {error && <div className="error-banner answer-banner" role="alert">{error}</div>}
    {message && <div className="notice answer-banner" role="status"><Check size={16} /> {message}</div>}

    <div className="answer-metrics" aria-label="Answer visibility readiness">
      <AnswerMetric value={`${readiness.complete}/${readiness.total}`} label="Actions ready" detail="Practical implementation checks" />
      <AnswerMetric value={profile.facts.length} label="Facts captured" detail="Claims with a source" />
      <AnswerMetric value={`${evidenceBackedAnswers}/${completedAnswers}`} label="Answers grounded" detail="Finished and supportable" />
      <AnswerMetric value={profile.answers.filter((answer) => answer.status === "published").length} label="Published" detail="Confirmed on a public page" />
    </div>

    <div className="answer-layout">
      <form className="answer-main" onSubmit={(event) => void save(event)}>
        <section className="answer-panel answer-action-panel">
          <div className="answer-panel-heading"><div><p className="eyebrow">Action queue</p><h3>Do the next useful thing</h3><p>This is a product-specific implementation plan. It measures whether the source work is ready, not whether an answer engine will cite it.</p></div><ListChecks size={22} /></div>
          <ol className="answer-action-list">{readiness.recommendations.map((recommendation) => <li className={recommendation.complete ? "complete" : ""} key={recommendation.id}><span className="answer-priority">{recommendation.complete ? <Check size={14} /> : recommendation.priority}</span><div><strong>{recommendation.title}</strong><p>{recommendation.detail}</p></div><button type="button" className="text-button" onClick={() => goTo(recommendation.target)}>{recommendation.complete ? "Review" : "Open"} <span>→</span></button></li>)}</ol>
        </section>

        <section className="answer-panel" id="answer-source">
          <div className="answer-panel-heading"><div><p className="eyebrow">1. Source page</p><h3>Give the product one clear public home</h3><p>Use an owned website page—not only its Google Play or App Store listing. This page needs the clear product explanation and answer content visitors can read.</p></div><ExternalLink size={22} /></div>
          <div className="answer-source-fields">
            <label>Canonical public page URL<input value={profile.primaryPageUrl} onChange={(event) => setProfile((current) => ({ ...current, primaryPageUrl: event.target.value }))} placeholder="https://yourproduct.com" inputMode="url" autoComplete="url" />{profile.primaryPageUrl && !hasSourcePage && <small className="answer-validation">Use an owned public website. Google Play and App Store links are not a substitute for the product’s canonical source page.</small>}</label>
            <div className="answer-direct-answer"><div className="answer-field-heading"><label htmlFor="answer-primary-claim">One factual direct answer</label><button type="button" className="secondary-button ai-action-button" onClick={() => void suggestDirectAnswer()} disabled={loading || suggesting || saving} aria-busy={suggesting}><Sparkles size={16} /> {suggesting ? "Suggesting…" : "Suggest answer"}</button></div><textarea id="answer-primary-claim" value={profile.primaryClaim} onChange={(event) => setProfile((current) => ({ ...current, primaryClaim: event.target.value }))} rows={3} placeholder={`What is ${product.name}, and why would someone use it?`} /><small>AI drafts from this product’s saved context and facts. Review it, then put the final answer visibly near the top of the public page.</small></div>
          </div>
          <div className="answer-inline-action"><span>{isPublicWebPage(savedWebsiteUrl) ? "The product’s saved website can be used as a starting point." : "Your saved product link is not an owned public website yet."}</span>{isPublicWebPage(savedWebsiteUrl) ? <button type="button" className="secondary-button" onClick={useProductLink}>Use saved product website</button> : <button type="button" className="secondary-button" onClick={onOpenSettings}>Add a product website</button>}</div>
        </section>

        <section className="answer-panel" id="answer-facts">
          <div className="answer-panel-heading"><div><p className="eyebrow">2. Facts &amp; evidence</p><h3>Keep every important claim supportable</h3><p>Add the facts or public documentation you would be comfortable showing a customer, journalist, or evaluator. These are your source notes—not automated market intelligence.</p></div><button type="button" className="answer-add-button" onClick={addFact}><Plus size={16} /> Add fact</button></div>
          {profile.facts.length ? <div className="answer-fact-list">{profile.facts.map((fact, index) => <article key={fact.id}><span>{index + 1}</span><div><label>Factual statement<input value={fact.statement} onChange={(event) => updateFact(fact.id, { statement: event.target.value })} placeholder="A verifiable capability, policy, or product fact" /></label><label>Public source URL <small>optional but recommended</small><input value={fact.sourceUrl} onChange={(event) => updateFact(fact.id, { sourceUrl: event.target.value })} placeholder="https://yourproduct.com/help/..." inputMode="url" /></label></div><button type="button" className="answer-remove" onClick={() => setProfile((current) => ({ ...current, facts: current.facts.filter((item) => item.id !== fact.id) }))} aria-label={`Remove fact ${index + 1}`}><Trash2 size={16} /></button></article>)}</div> : <div className="answer-empty"><Lightbulb size={21} /><div><strong>Start with two defensible facts</strong><p>For example: a feature a visitor can use, an availability detail, or a policy the public page documents.</p><button type="button" className="text-button" onClick={addFact}>Add the first fact →</button></div></div>}
        </section>

        <section className="answer-panel" id="answer-answers">
          <div className="answer-panel-heading"><div><p className="eyebrow">3. Direct answers</p><h3>Answer the questions before an engine has to infer them</h3><p>Lead with a concise answer, then add detail that a visitor can verify. Mark “Published” only after the same answer is live on the source page.</p></div><div className="answer-panel-tools"><button type="button" className="secondary-button" onClick={addStarterAnswers}>Add starter questions</button><button type="button" className="answer-add-button" onClick={addAnswer}><Plus size={16} /> Add answer</button></div></div>
          {profile.answers.length ? <div className="answer-card-list">{profile.answers.map((answer, index) => <article className="answer-card" key={answer.id}><div className="answer-card-top"><span>Q{index + 1}</span><div><select value={answer.status} onChange={(event) => updateAnswer(answer.id, { status: event.target.value as AnswerCard["status"] })} aria-label={`Status for answer ${index + 1}`}><option value="draft">Draft</option><option value="ready">Ready to publish</option><option value="published">Published</option></select><button type="button" className="answer-remove" onClick={() => setProfile((current) => ({ ...current, answers: current.answers.filter((item) => item.id !== answer.id) }))} aria-label={`Remove answer ${index + 1}`}><Trash2 size={16} /></button></div></div><label>Question<input value={answer.question} onChange={(event) => updateAnswer(answer.id, { question: event.target.value })} placeholder="What would a person naturally ask?" /></label><label>Direct answer<textarea value={answer.answer} onChange={(event) => updateAnswer(answer.id, { answer: event.target.value })} placeholder="Answer plainly first. Keep it accurate, useful, and specific." rows={4} /></label><label>Supporting public source <small>optional when a saved fact supports this answer</small><input value={answer.sourceUrl} onChange={(event) => updateAnswer(answer.id, { sourceUrl: event.target.value })} placeholder="https://yourproduct.com/..." inputMode="url" /></label>{answer.answer.trim() && !answerIsBacked(answer, profile.facts) && <p className="answer-validation">Add a public source here or capture a supporting fact above before treating this answer as ready.</p>}</article>)}</div> : <div className="answer-empty"><FileText size={21} /><div><strong>Start with the three questions visitors ask first</strong><p>What is it? Who is it for? How does it help? They stay editable and unpublished until you choose to save and publish them yourself.</p><button type="button" className="text-button" onClick={addStarterAnswers}>Add starter questions →</button></div></div>}
        </section>

        <div className="answer-save-bar"><span>{profile.updatedAt ? "Changes are saved only when you press Save." : "Nothing has been saved yet."}</span><button type="submit" className="primary-button" disabled={loading || saving}>{saving ? "Saving…" : "Save answer visibility work"}</button></div>
      </form>

      <aside className="answer-sidebar">
        <section className="answer-side-card answer-package" id="answer-package"><p className="eyebrow">4. Page package</p><h3>Hand a developer the right assets</h3><p>These are implementation drafts, not a publishing button. The finished page must show matching content to visitors and remain publicly crawlable.</p><div className="answer-package-actions"><button type="button" className="secondary-button" onClick={() => void copy(pageBrief, "Page brief")}><Clipboard size={16} /> Copy page brief</button><button type="button" className="secondary-button" onClick={() => void copy(schema, "Application schema")} disabled={!schemaReady} title={schemaReady ? "Copy application schema" : "Add an owned source page and direct answer first"}><Code2 size={16} /> Copy app schema</button></div>{!schemaReady && <p className="answer-package-hint">Add an owned public page and factual direct answer before exporting schema.</p>}<details><summary>Preview application schema</summary><pre>{schema}</pre></details></section>
        <section className="answer-side-card answer-checklist"><p className="eyebrow">Before publishing</p><h3>Simple release check</h3><ul><li><Check size={14} /> The page explains the product in plain language.</li><li><Check size={14} /> Important answers are visible to visitors.</li><li><Check size={14} /> Facts link to public evidence or documentation.</li><li><Check size={14} /> Markup repeats—not replaces—the visible content.</li></ul></section>
        <section className="answer-side-card answer-guide"><p className="eyebrow">What this is for</p><h3>Clarity across search and answer engines</h3><p>Use AEO on your owned website to explain the product with supported answers. Website SEO handles search intent and page discovery. Apps and games use ASO separately for store listings.</p><button type="button" className="text-button" onClick={onOpenListing}>{isWebsite ? "Continue with website SEO →" : "Continue with store ASO →"}</button></section>
      </aside>
    </div>
  </section>;
}

function AnswerMetric({ value, label, detail }: { value: string | number; label: string; detail: string }) {
  return <div className="answer-metric"><strong>{value}</strong><span>{label}</span><small>{detail}</small></div>;
}
