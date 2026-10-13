"use client";

import { useEffect, useState } from "react";

type Brief = { intent: string; semanticCore: string; competitors: string; proof: string; notes: string };
type Check = { id: string; label: string; passed: boolean; evidence: string; recommendation: string };
type Audit = { url: string; checkedAt: string; status: number; title: string; description: string; canonical: string; h1Count: number; language: string; checks: Check[] };
type Metric = { date: string; clicks: number; impressions: number; notes: string };
type MetricDraft = { date: string; clicks: string; impressions: string; notes: string };
const blank: Brief = { intent: "", semanticCore: "", competitors: "", proof: "", notes: "" };

export function WebsiteSeoWorkspace({ product, onAnswers }: { product: { id: number; name: string; url?: string; websiteUrl?: string }; onAnswers: () => void }) {
  const [brief, setBrief] = useState(blank);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [actions, setActions] = useState<Record<string, string>>({});
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [metric, setMetric] = useState<MetricDraft>({ date: new Date().toISOString().slice(0, 10), clicks: "", impressions: "", notes: "" });
  const [loading, setLoading] = useState(true);
  const [inspecting, setInspecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pageUrl = product.websiteUrl || product.url || "";
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(`/api/products/${product.id}/research`, { signal: controller.signal }).then(async response => { const data = await response.json() as { research?: Brief; error?: string }; if (!response.ok) throw new Error(data.error || "Could not load SEO work."); setBrief({ ...blank, ...data.research }); }),
      fetch(`/api/products/${product.id}/seo`, { signal: controller.signal }).then(async response => { const data = await response.json() as { audit?: Audit | null; actionStates?: Record<string, string>; metrics?: Metric[]; error?: string }; if (!response.ok) throw new Error(data.error || "Could not load website checks."); setAudit(data.audit ?? null); setActions(data.actionStates ?? {}); setMetrics(data.metrics ?? []); }),
    ]).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load SEO work."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [product.id]);

  async function inspect() {
    setInspecting(true); setError(""); setMessage("");
    try { const response = await fetch(`/api/products/${product.id}/seo`, { method: "POST" }); const data = await response.json() as { audit?: Audit; actionStates?: Record<string, string>; error?: string }; if (!response.ok) throw new Error(data.error || "Could not inspect this website."); setAudit(data.audit ?? null); setActions(data.actionStates ?? {}); setMessage("Page checked. After you publish a fix, run this check again to verify it."); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not inspect this website."); }
    finally { setInspecting(false); }
  }
  async function saveBrief() {
    setSaving(true); setError(""); setMessage("");
    try { const response = await fetch(`/api/products/${product.id}/research`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(brief) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error || "Could not save SEO work."); setMessage("SEO plan saved."); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not save."); }
    finally { setSaving(false); }
  }
  async function markDone(checkId: string, done: boolean) {
    try { const response = await fetch(`/api/products/${product.id}/seo`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checkId, state: done ? "done" : "open" }) }); const data = await response.json() as { actionStates?: Record<string, string>; error?: string }; if (!response.ok) throw new Error(data.error || "Could not save action."); setActions(data.actionStates ?? {}); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not save action."); }
  }
  async function addMetric() {
    try { const response = await fetch(`/api/products/${product.id}/seo`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metrics: [...metrics, { ...metric, clicks: Number(metric.clicks), impressions: Number(metric.impressions) }].slice(-24) }) }); const data = await response.json() as { metrics?: Metric[]; error?: string }; if (!response.ok) throw new Error(data.error || "Could not save measurement."); setMetrics(data.metrics ?? []); setMetric({ date: new Date().toISOString().slice(0, 10), clicks: "", impressions: "", notes: "" }); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not save measurement."); }
  }
  const fields = [["intent", "Audience and search intent", "Who is searching, what do they need, and which page should help them?"], ["semanticCore", "Search queries and target pages", "One topic per line: query → target URL → intended action. Add observed Search Console queries when available."], ["competitors", "Search results and content gaps", "Record competing pages and useful information your page can add."], ["proof", "Evidence and measurement", "Record Search Console observations, dates, impressions, clicks, and conversions. These are your notes, not a live integration."], ["notes", "Technical review and next actions", "Record findings and next steps."]] as const;
  return <section className="listing-workspace"><div className="listing-heading"><div><p className="eyebrow">Website · SEO</p><h2>Search visibility for {product.name}</h2><p>Inspect the public page, work through evidence-backed fixes, then recheck the live result.</p></div><button className="secondary-button" onClick={onAnswers}>Website AEO →</button></div>
    <div className="listing-editor-toolbar"><div><h3>Live page check</h3><p>{pageUrl || "Add a website destination in product settings."} {audit ? ` · Last checked ${new Date(audit.checkedAt).toLocaleString()}` : ""}</p></div><button className="primary-button" disabled={!pageUrl || inspecting} onClick={() => void inspect()}>{inspecting ? "Checking page…" : audit ? "Recheck live page" : "Inspect website"}</button></div>
    {audit && <><div className="metrics website-seo-metrics">{[[String(audit.checks.filter(check => check.passed).length), "Checks passing"], [String(audit.checks.filter(check => !check.passed).length), "Open findings"], [String(metrics.length), "Search Console notes"]].map(([value,label]) => <article className="metric-card website-seo-metric" key={label}><strong>{value}</strong><span>{label}</span></article>)}</div><div className="listing-editor-card"><h3>Findings and actions</h3>{audit.checks.map(check => <article className="seo-finding" key={check.id}><div><strong>{check.passed ? "✓" : "○"} {check.label}</strong><p>{check.evidence}</p>{!check.passed && <p>{check.recommendation}</p>}</div>{!check.passed && <button className="secondary-button" disabled={actions[check.id] === "verified"} onClick={() => void markDone(check.id, actions[check.id] !== "done")}>{actions[check.id] === "verified" ? "Verified on recheck" : actions[check.id] === "done" ? "Marked done · undo" : "Mark published"}</button>}</article>)}</div><div className="listing-context"><h3>Page details observed</h3><p><strong>Title:</strong> {audit.title || "Missing"}</p><p><strong>Description:</strong> {audit.description || "Missing"}</p><p><strong>Canonical:</strong> {audit.canonical || "Missing"}</p><p><strong>H1 headings:</strong> {audit.h1Count} · <strong>Language:</strong> {audit.language || "Undeclared"}</p></div></>}
    <div className="listing-editor-card"><h3>Search performance notes</h3><p>Enter figures you observe in Search Console; this workspace does not currently connect to that account. Enter 0 only when the source actually reports zero.</p><div className="research-two-col"><label>Date<input type="date" value={metric.date} onChange={event => setMetric({ ...metric, date: event.target.value })} /></label><label>Clicks<input type="number" min="0" value={metric.clicks} onChange={event => setMetric({ ...metric, clicks: event.target.value })} /></label><label>Impressions<input type="number" min="0" value={metric.impressions} onChange={event => setMetric({ ...metric, impressions: event.target.value })} /></label><label>Note<input value={metric.notes} onChange={event => setMetric({ ...metric, notes: event.target.value })} placeholder="Query group or date range" /></label></div><button className="secondary-button" disabled={!metric.date || metric.clicks === "" || metric.impressions === ""} onClick={() => void addMetric()}>Save measurement</button>{metrics.map((row,index) => <p key={`${row.date}-${index}`}>{row.date}: {row.clicks} clicks / {row.impressions} impressions {row.notes && `· ${row.notes}`}</p>)}</div>
    {loading ? <p role="status">Loading saved SEO work…</p> : <div className="listing-editor-card">{fields.map(([key,label,hint]) => <div className="listing-field" key={key}><label htmlFor={`seo-${key}`}>{label}</label><textarea id={`seo-${key}`} rows={4} value={brief[key]} placeholder={hint} disabled={saving} onChange={event => setBrief({ ...brief, [key]: event.target.value })} /><small>{hint}</small></div>)}<button className="primary-button" disabled={saving} onClick={() => void saveBrief()}>{saving ? "Saving…" : "Save SEO plan"}</button></div>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
