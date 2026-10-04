"use client";

import { useState } from "react";
import { GooglePlayListingLocalization, type OptimizationDraft } from "./GooglePlayListingLocalization";
import { GooglePlayExperimentTracker } from "./GooglePlayExperimentTracker";
import { resolveGooglePlayListingSource, validateGooglePlayListingText } from "../lib/google-play-localizations";

type Section = "copy" | "translations" | "review" | "experiments";
const sections: Array<{ id: Section; label: string }> = [
  { id: "copy", label: "English listing" },
  { id: "translations", label: "Translations" },
  { id: "review", label: "Review & send" },
  { id: "experiments", label: "Experiments" },
];

export function ListingWorkspace({ product, optimization, loading, saving, generating, onChange, onSave, onGenerate, onSettings, initialSection = "copy", initialExperimentOpportunity, onSectionChange }: {
  product: { id: number; name: string };
  optimization: OptimizationDraft;
  loading: boolean;
  saving: boolean;
  generating: boolean;
  onChange: (draft: OptimizationDraft) => void;
  onSave: () => void;
  onGenerate: () => void;
  onSettings: () => void;
  initialSection?: Section;
  initialExperimentOpportunity?: string;
  onSectionChange?: () => void;
}) {
  const [section, setSection] = useState<Section>(initialSection);
  const [showCurrent, setShowCurrent] = useState(false);
  const [localizationBusy, setLocalizationBusy] = useState(false);
  const current = optimization.currentListing ?? {};
  const { listing: source } = resolveGooglePlayListingSource({ title: optimization.storeTitle, shortDescription: optimization.storeShortDescription, fullDescription: optimization.storeLongDescription }, current);
  const errors = validateGooglePlayListingText(source);
  const fields = [
    { key: "storeTitle", current: "title", label: "App title", limit: 30, rows: 1 },
    { key: "storeShortDescription", current: "shortDescription", label: "Short description", limit: 80, rows: 3 },
    { key: "storeLongDescription", current: "longDescription", label: "Full description", limit: 4000, rows: 12 },
  ] as const;
  const busy = saving || generating || localizationBusy;
  if (loading || optimization.productId !== product.id) return <div className="loading-line" role="status">Loading this product’s listing…</div>;

  return <section className="listing-workspace">
    <div className="listing-heading"><div><p className="eyebrow">Google Play</p><h2>Store listing</h2><p>Improve the fields that matter. Keep the rest as they are.</p></div><button className="secondary-button" onClick={onSettings}>Store connection</button></div>
    <nav className="listing-sections" aria-label="Store listing sections">{sections.map((item) => <button key={item.id} type="button" aria-current={section === item.id ? "page" : undefined} className={section === item.id ? "active" : ""} onClick={() => { onSectionChange?.(); setSection(item.id); }} disabled={busy}>{item.label}</button>)}</nav>
    {section === "copy" && <>
      <div className="listing-editor-toolbar"><div><h3>English (United States)</h3><p>Your shared source for translations. Saving does not publish.</p></div><button className="secondary-button ai-action-button" disabled={busy} onClick={() => { if (window.confirm("Generate a new listing draft? This replaces the current draft, including unsaved copy. Translations will need review if the English source changes.")) onGenerate(); }}>✦ {generating ? "Generating…" : "Suggest a new draft"}</button></div>
      <div className="listing-editor-layout"><div className="listing-editor-card">
        <div className="listing-editor-toolbar"><strong>Listing draft</strong><button type="button" className="text-button" aria-pressed={showCurrent} onClick={() => setShowCurrent(!showCurrent)}>{showCurrent ? "Hide comparison" : "Compare with last sync"}</button></div>
        {fields.map((field) => {
          const value = optimization[field.key];
          const previous = current[field.current] ?? "";
          const changed = value.trim() !== previous.trim();
          return <div className="listing-field" key={field.key}>
            <label htmlFor={`listing-${field.key}`}>{field.label}<span className={value.length > field.limit ? "localization-error" : ""}>{value.length.toLocaleString()} / {field.limit.toLocaleString()}</span></label>
            {showCurrent && <div className="listing-previous"><small>Last synced</small><p>{previous || "No synced value available"}</p></div>}
            {field.rows === 1 ? <input id={`listing-${field.key}`} value={value} disabled={busy} onChange={(event) => onChange({ ...optimization, [field.key]: event.target.value })} /> : <textarea id={`listing-${field.key}`} rows={field.rows} value={value} disabled={busy} onChange={(event) => onChange({ ...optimization, [field.key]: event.target.value })} />}
            <small>{!value.trim() && previous ? "Empty draft: the last synced value will be kept." : changed ? "Changed from last sync" : "Unchanged · this is fine"}</small>
          </div>;
        })}
      </div><aside className="listing-context"><h3>What to improve</h3><p>Recommendations are optional. You can edit and send a single field without completing a brief.</p>
        {optimization.opportunities.filter((item) => !/aeo/i.test(item.area) && item.status !== "done").slice(0, 3).map((item, index) => <article key={index}><strong>{item.title}</strong><p>{item.rationale}</p></article>)}
        <details><summary>Source details</summary><p>{current.fetchedAt ? `Last fetched ${new Date(current.fetchedAt).toLocaleDateString()}.` : "No sync date available."} This is a saved snapshot, not a live status check.</p><button className="text-button" onClick={onSettings}>Manage connection and sync</button></details>
      </aside></div>
      {errors.length > 0 && <p className="localization-error" role="status">{errors.join(" ")}</p>}
      <div className="listing-action-bar"><span>Only selected locales are sent after your confirmation.</span><div><button className="secondary-button" disabled={busy} onClick={onSave}>{saving ? "Saving…" : "Save draft"}</button><button className="primary-button" disabled={busy || errors.length > 0} onClick={() => setSection("review")}>Review & send →</button></div></div>
    </>}
    <div hidden={section !== "translations" && section !== "review"}>
      <GooglePlayListingLocalization productId={product.id} productName={product.name} optimization={optimization} onChange={onChange} mode={section === "review" ? "review" : "translations"} onReview={() => setSection("review")} onBusyChange={setLocalizationBusy} />
    </div>
    {section === "experiments" && <GooglePlayExperimentTracker opportunities={optimization.opportunities.filter((item) => !/aeo/i.test(item.area))} experiments={optimization.experiments ?? []} initialOpportunityTitle={initialExperimentOpportunity} onChange={(experiments) => onChange({ ...optimization, experiments })} onSave={onSave} saving={saving} />}
  </section>;
}
