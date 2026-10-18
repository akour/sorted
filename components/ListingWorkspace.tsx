"use client";

import { ListingDescriptionReview } from "./ListingDescriptionReview";
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

export function ListingWorkspace({ product, optimization, loading, saving, generating, onChange, onSave, onGenerate, onSettings, platform = "google-play", availablePlatforms = [platform], initialSection = "copy", initialExperimentOpportunity, onSectionChange }: {
  platform?: "google-play" | "app-store";
  availablePlatforms?: Array<"google-play" | "app-store">;
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
  const [selectedPlatform, setSelectedPlatform] = useState<"google-play" | "app-store">(availablePlatforms.includes(platform) ? platform : availablePlatforms[0] ?? platform);
  const [showCurrent, setShowCurrent] = useState(false);
  const [localizationBusy, setLocalizationBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const current = optimization.currentListing ?? {};
  const { listing: source } = resolveGooglePlayListingSource({ title: optimization.storeTitle, shortDescription: optimization.storeShortDescription, fullDescription: optimization.storeLongDescription }, current);
  const errors = validateGooglePlayListingText(source);
  const fields = [
    { key: "storeTitle", current: "title", label: "App title", limit: 30, rows: 1 },
    { key: "storeShortDescription", current: "shortDescription", label: "Short description", limit: 80, rows: 3 },
    { key: "storeLongDescription", current: "longDescription", label: "Full description", limit: 4000, rows: 12 },
  ] as const;
  const busy = saving || generating || localizationBusy || reviewBusy;
  if (loading || optimization.productId !== product.id) return <div className="loading-line" role="status">Loading this product’s listing…</div>;

  if (selectedPlatform === "app-store") {
    const draft = optimization.appStoreDraft ?? { appName: "", subtitle: "", description: "", keywords: "" };
    const appleFields = [{ key: "appName", label: "App name", limit: 30, rows: 1 }, { key: "subtitle", label: "Subtitle", limit: 30, rows: 1 }, { key: "description", label: "Description", limit: 4000, rows: 10 }, { key: "keywords", label: "Keywords", limit: 100, rows: 3 }] as const;
    const invalid = appleFields.some(field => field.key === "keywords" ? new TextEncoder().encode(draft.keywords).length > field.limit : draft[field.key].length > field.limit);
    return <section className="listing-workspace"><div className="listing-heading"><div><p className="eyebrow">Apple App Store · ASO</p><h2>Apple listing draft</h2><p>Prepare copy for App Store Connect. Apple keyword research, localization, analytics, and direct publishing are not connected yet.</p></div>{availablePlatforms.length > 1 && <select aria-label="Store destination" value={selectedPlatform} onChange={event => setSelectedPlatform(event.target.value as "google-play" | "app-store")}><option value="google-play">Google Play</option><option value="app-store">Apple App Store</option></select>}</div><div className="listing-editor-card">{appleFields.map(field => <div className="listing-field" key={field.key}><label htmlFor={`apple-${field.key}`}>{field.label}<span>{field.key === "keywords" ? `${new TextEncoder().encode(draft.keywords).length} / ${field.limit} bytes` : `${draft[field.key].length} / ${field.limit}`}</span></label>{field.rows === 1 ? <input id={`apple-${field.key}`} value={draft[field.key]} disabled={saving} onChange={event => onChange({ ...optimization, appStoreDraft: { ...draft, [field.key]: event.target.value } })} /> : <textarea id={`apple-${field.key}`} rows={field.rows} value={draft[field.key]} disabled={saving} onChange={event => onChange({ ...optimization, appStoreDraft: { ...draft, [field.key]: event.target.value } })} />}{(field.key === "keywords" ? new TextEncoder().encode(draft.keywords).length > field.limit : draft[field.key].length > field.limit) && <small role="alert">Shorten this field before saving.</small>}</div>)}<button className="primary-button" disabled={saving || invalid} onClick={onSave}>{saving ? "Saving…" : "Save Apple draft"}</button><p className="field-help">Saved separately from your Google Play listing. Review and publish manually in App Store Connect.</p></div></section>;
  }

  return <section className="listing-workspace">
    <div className="listing-heading"><div><p className="eyebrow">Google Play · ASO</p><h2>Google Play listing</h2><p>Improve the fields that matter. Keep the rest as they are.</p></div>{availablePlatforms.length > 1 && <select aria-label="Store destination" value={selectedPlatform} onChange={event => setSelectedPlatform(event.target.value as "google-play" | "app-store")}><option value="google-play">Google Play</option><option value="app-store">Apple App Store</option></select>}<button className="secondary-button" onClick={onSettings}>Store connection</button></div>
    <nav className="listing-sections" aria-label="Store listing sections">{sections.map((item) => <button key={item.id} type="button" aria-current={section === item.id ? "page" : undefined} className={section === item.id ? "active" : ""} onClick={() => { onSectionChange?.(); setSection(item.id); }} disabled={busy}>{item.label}</button>)}</nav>
    {section === "copy" && <>
      <section className="listing-next-action"><p className="eyebrow">Your next step · English listing</p><h3>{!current.fetchedAt ? "Confirm the current listing first" : !optimization.storeLongDescription.trim() ? "Start with your current description" : "Choose one improvement to review"}</h3><p>{!current.fetchedAt ? "Connect Google Play and refresh the listing so you can compare against a dated source. You can still prepare a draft now." : `Your baseline was fetched ${new Date(current.fetchedAt).toLocaleDateString()}. Review one message, save your draft, and compare changes before sending. A saved snapshot is not a live publication check.`}</p><ol><li>Review evidence and edit</li><li>Save the draft</li><li>Review & send selected locales</li><li>Verify in Play Console and measure</li></ol></section>
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
        <ListingDescriptionReview productId={product.id} text={source.fullDescription} disabled={busy} onBusyChange={setReviewBusy} onChange={storeLongDescription => onChange({...optimization,storeLongDescription})} />
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
