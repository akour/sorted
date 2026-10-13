"use client";

import { useEffect, useState } from "react";

type Brief = { intent: string; semanticCore: string; competitors: string; proof: string; notes: string };
const blank: Brief = { intent: "", semanticCore: "", competitors: "", proof: "", notes: "" };

export function WebsiteSeoWorkspace({ product, onAnswers }: { product: { id: number; name: string }; onAnswers: () => void }) {
  const [brief, setBrief] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/products/${product.id}/research`, { signal: controller.signal }).then(async response => {
      const data = await response.json() as { research?: Brief; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load SEO work.");
      setBrief({ ...blank, ...data.research });
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [product.id]);
  async function save() {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/products/${product.id}/research`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(brief) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save SEO work.");
      setMessage("SEO plan saved. Your website has not been changed.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save."); }
    finally { setSaving(false); }
  }
  return <section className="listing-workspace"><div className="listing-heading"><div><p className="eyebrow">Website · SEO</p><h2>Search visibility for {product.name}</h2><p>Plan the pages people need, the queries they answer, and the evidence you will measure.</p></div></div>
    {loading ? <p role="status">Loading SEO plan…</p> : <><div className="listing-editor-card">{([
      ["intent", "Audience and search intent", "Who is searching, what do they need, and which page should help them?"],
      ["semanticCore", "Search queries and target pages", "One topic per line: query → target URL → intended action. Add observed Search Console queries when available."],
      ["competitors", "Search results and content gaps", "Record competing pages and useful information your page can add."],
      ["proof", "Evidence and measurement", "Record Search Console observations, dates, impressions, clicks, and conversions. These are your notes, not a live integration."],
      ["notes", "Technical review and next actions", "Check indexing, canonical URLs, sitemap, titles, internal links, mobile readability, and page speed. Record findings and next actions."],
    ] as const).map(([key, label, hint]) => <div className="listing-field" key={key}><label htmlFor={`seo-${key}`}>{label}</label><textarea id={`seo-${key}`} rows={4} value={brief[key]} placeholder={hint} disabled={saving} onChange={event => setBrief({ ...brief, [key]: event.target.value })} /><small>{hint}</small></div>)}<button className="primary-button" disabled={saving || Boolean(error && !brief.intent)} onClick={() => void save()}>{saving ? "Saving…" : "Save SEO plan"}</button></div><div className="listing-context"><h3>Answer engine optimization</h3><p>Use your owned website as the source for factual answers, supporting evidence, and a page package.</p><button className="secondary-button" onClick={onAnswers}>Open website AEO →</button></div></>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}
