"use client";

import { useEffect, useState } from "react";

type Brief = { intent: string; semanticCore: string; competitors: string; proof: string; notes: string };
type Check = { id: string; label: string; passed: boolean; evidence: string; recommendation: string };
type Audit = { url: string; checkedAt: string; status: number; title: string; description: string; canonical: string; h1Count: number; language: string; checks: Check[] };
type Metric = { date: string; clicks: number; impressions: number; notes: string };
type MetricDraft = { date: string; clicks: string; impressions: string; notes: string };
type SearchConsoleSite = { siteUrl: string; permissionLevel: string };
type SearchConsoleRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
type SearchConsoleSnapshot = { startDate: string; endDate: string; fetchedAt: string; totals: { clicks: number; impressions: number; ctr: number; position: number }; daily: SearchConsoleRow[]; queries: SearchConsoleRow[]; pages: SearchConsoleRow[] };
type SearchConsoleState = { connected: boolean; needsReconnect?: boolean; oauthConfigured?: boolean; accountEmail?: string; error?: string; sites: SearchConsoleSite[]; selectedProperty: string; snapshot: SearchConsoleSnapshot | null };
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
    <SearchConsolePanel productId={product.id} />
    {audit && <><div className="metrics website-seo-metrics">{[[String(audit.checks.filter(check => check.passed).length), "Checks passing"], [String(audit.checks.filter(check => !check.passed).length), "Open findings"], [String(metrics.length), "Manual observations"]].map(([value,label]) => <article className="metric-card website-seo-metric" key={label}><strong>{value}</strong><span>{label}</span></article>)}</div><div className="listing-editor-card"><h3>Findings and actions</h3>{audit.checks.map(check => <article className="seo-finding" key={check.id}><div><strong>{check.passed ? "✓" : "○"} {check.label}</strong><p>{check.evidence}</p>{!check.passed && <p>{check.recommendation}</p>}</div>{!check.passed && <button className="secondary-button" disabled={actions[check.id] === "verified"} onClick={() => void markDone(check.id, actions[check.id] !== "done")}>{actions[check.id] === "verified" ? "Verified on recheck" : actions[check.id] === "done" ? "Marked done · undo" : "Mark published"}</button>}</article>)}</div><div className="listing-context"><h3>Page details observed</h3><p><strong>Title:</strong> {audit.title || "Missing"}</p><p><strong>Description:</strong> {audit.description || "Missing"}</p><p><strong>Canonical:</strong> {audit.canonical || "Missing"}</p><p><strong>H1 headings:</strong> {audit.h1Count} · <strong>Language:</strong> {audit.language || "Undeclared"}</p></div></>}
    <details className="listing-editor-card seo-manual-notes"><summary>Manual notes and measurements · optional</summary><p>Use this for context or older reports that are not available in the connected Search Console account.</p><div className="research-two-col"><label>Date<input type="date" value={metric.date} onChange={event => setMetric({ ...metric, date: event.target.value })} /></label><label>Clicks<input type="number" min="0" value={metric.clicks} onChange={event => setMetric({ ...metric, clicks: event.target.value })} /></label><label>Impressions<input type="number" min="0" value={metric.impressions} onChange={event => setMetric({ ...metric, impressions: event.target.value })} /></label><label>Note<input value={metric.notes} onChange={event => setMetric({ ...metric, notes: event.target.value })} placeholder="Query group or date range" /></label></div><button className="secondary-button" disabled={!metric.date || metric.clicks === "" || metric.impressions === ""} onClick={() => void addMetric()}>Save measurement</button>{metrics.map((row,index) => <p key={`${row.date}-${index}`}>{row.date}: {row.clicks} clicks / {row.impressions} impressions {row.notes && `· ${row.notes}`}</p>)}</details>
    {loading ? <p role="status">Loading saved SEO work…</p> : <div className="listing-editor-card">{fields.map(([key,label,hint]) => <div className="listing-field" key={key}><label htmlFor={`seo-${key}`}>{label}</label><textarea id={`seo-${key}`} rows={4} value={brief[key]} placeholder={hint} disabled={saving} onChange={event => setBrief({ ...brief, [key]: event.target.value })} /><small>{hint}</small></div>)}<button className="primary-button" disabled={saving} onClick={() => void saveBrief()}>{saving ? "Saving…" : "Save SEO plan"}</button></div>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}

function SearchConsolePanel({ productId }: { productId: number }) {
  const [data, setData] = useState<SearchConsoleState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endpoint = `/api/products/${productId}/seo/search-console`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { signal: controller.signal }).then(async (response) => {
      const payload = await response.json() as SearchConsoleState & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load Search Console.");
      setData(payload);
    }).catch((loadError) => {
      if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Could not load Search Console.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint]);

  async function chooseProperty(property: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "select-property", property }) });
      const payload = await response.json() as { selectedProperty?: string; snapshot?: SearchConsoleSnapshot | null; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not select this property.");
      setData((current) => current ? { ...current, selectedProperty: payload.selectedProperty ?? property, snapshot: payload.snapshot ?? null } : current);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Could not select this property."); }
    finally { setBusy(false); }
  }

  async function sync() {
    setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync" }) });
      const payload = await response.json() as { selectedProperty?: string; snapshot?: SearchConsoleSnapshot; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not sync Search Console data.");
      setData((current) => current ? { ...current, selectedProperty: payload.selectedProperty ?? current.selectedProperty, snapshot: payload.snapshot ?? null } : current);
    } catch (syncError) { setError(syncError instanceof Error ? syncError.message : "Could not sync Search Console data."); }
    finally { setBusy(false); }
  }

  const snapshot = data?.snapshot;
  return <section className="listing-editor-card search-console-card">
    <div className="search-console-heading"><div><p className="eyebrow">Google Search Console · read-only</p><h3>Real search performance</h3><p>Connect once for your account, then choose the property for this product’s website.</p></div>{data?.connected && <span className="search-console-connected">Connected{data.accountEmail ? ` · ${data.accountEmail}` : ""}</span>}</div>
    {loading ? <p role="status">Checking Google connection…</p> : !data?.connected ? <div className="search-console-connect"><p>{!data?.oauthConfigured ? "Google OAuth has not been enabled by your Sorted administrator yet." : data?.needsReconnect ? "Your Google authorization needs to be renewed." : "Connect the Google account that can view this website in Search Console."}</p>{data?.oauthConfigured && <a className="primary-button" href={`/api/products/${productId}/seo/search-console/connect`}>{data.needsReconnect ? "Reconnect Google account" : "Connect Google Search Console"}</a>}{data?.error && <p className="search-console-error" role="alert">{data.error}</p>}</div> : <>
      <div className="search-console-controls"><label>Website property<select value={data.selectedProperty} disabled={busy || data.sites.length === 0} onChange={(event) => void chooseProperty(event.target.value)}><option value="">Choose a matching property</option>{data.sites.map((site) => <option key={site.siteUrl} value={site.siteUrl}>{site.siteUrl} · {site.permissionLevel.replace(/^site/, "")}</option>)}</select></label><button className="primary-button" disabled={busy || !data.selectedProperty} onClick={() => void sync()}>{busy ? "Loading data…" : snapshot ? "Refresh Search Console data" : "Load Search Console data"}</button></div>
      {data.sites.length === 0 && <p className="search-console-muted">No matching property was found for this website in the connected Google account. Add or grant access to the matching Search Console property, then refresh this section.</p>}
      {snapshot && <>
        <div className="metrics website-seo-metrics search-console-metrics">{[[snapshot.totals.clicks.toLocaleString(), "Clicks"], [snapshot.totals.impressions.toLocaleString(), "Impressions"], [`${(snapshot.totals.ctr * 100).toFixed(1)}%`, "Average CTR"], [snapshot.totals.position.toFixed(1), "Average position"]].map(([value, label]) => <article className="website-seo-metric" key={label}><strong>{value}</strong><span>{label}</span></article>)}</div>
        <p className="search-console-muted">{snapshot.startDate}–{snapshot.endDate} · updated {new Date(snapshot.fetchedAt).toLocaleString()}. Recent days may be delayed; query and page tables show up to Google’s top 50 rows, not a complete keyword database.</p>
        <div className="search-console-tables"><SearchConsoleTable title="Top queries" rows={snapshot.queries} empty="No query data for this period." /><SearchConsoleTable title="Top pages" rows={snapshot.pages} empty="No page data for this period." /></div>
      </>}
      {data.error && <p className="search-console-error" role="alert">{data.error} {data.needsReconnect && <a href={`/api/products/${productId}/seo/search-console/connect`}>Reconnect</a>}</p>}
    </>}
    {error && <p className="search-console-error" role="alert">{error}</p>}
    <p className="search-console-footnote">Sorted only reads this account’s Search Console properties and search performance. It does not edit your site, add properties, or publish changes.</p>
  </section>;
}

function SearchConsoleTable({ title, rows, empty }: { title: string; rows: SearchConsoleRow[]; empty: string }) {
  return <div className="search-console-table"><h4>{title}</h4>{rows.length ? <div className="search-console-table-scroll"><table><thead><tr><th>Search term or page</th><th>Clicks</th><th>Impressions</th><th>Position</th></tr></thead><tbody>{rows.slice(0, 10).map((row, index) => <tr key={`${row.keys[0] ?? "row"}-${index}`}><td title={row.keys[0]}>{row.keys[0] || "—"}</td><td>{row.clicks.toLocaleString()}</td><td>{row.impressions.toLocaleString()}</td><td>{row.position.toFixed(1)}</td></tr>)}</tbody></table></div> : <p>{empty}</p>}</div>;
}
