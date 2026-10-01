"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  GOOGLE_PLAY_TARGET_LOCALES,
  listingSourceFingerprint,
  resolveGooglePlayListingSource,
  validateGooglePlayListingText,
  type LocalizedStoreListing,
} from "../lib/google-play-localizations";

type OptimizationDraft = {
  productId: number;
  focus: string;
  storeTitle: string;
  storeSubtitle: string;
  storeShortDescription: string;
  storeLongDescription: string;
  answerSummary: string;
  currentListing: { platform?: string; title?: string; subtitle?: string; shortDescription?: string; longDescription?: string; sourceUrl?: string; fetchedAt?: string; category?: string; developer?: string; iconUrl?: string; bundleId?: string; storeId?: string };
  opportunities: Array<{ title: string; area: string; impact: string; effort: string; rationale: string; status: "open" | "done" }>;
  nextActions: Array<{ title: string; area: string; status: "open" | "done" }>;
  localizedListings: LocalizedStoreListing[];
  updatedAt?: string;
};

export function GooglePlayListingLocalization({
  productId,
  productName,
  optimization,
  onChange,
}: {
  productId: number;
  productName: string;
  optimization: OptimizationDraft;
  onChange: (next: OptimizationDraft) => void;
}) {
  const [generatingLocale, setGeneratingLocale] = useState("");
  const [bulkProgress, setBulkProgress] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [connectionState, setConnectionState] = useState<{ productId: number; connected: boolean } | null>(null);
  const [selectedLocales, setSelectedLocales] = useState<Set<string>>(() => new Set(["en-US"]));
  const listings = optimization.localizedListings;
  const latestListings = useRef(listings);
  const { listing: source, fullDescriptionSource } = resolveGooglePlayListingSource({
    title: optimization.storeTitle,
    shortDescription: optimization.storeShortDescription,
    fullDescription: optimization.storeLongDescription,
  }, optimization.currentListing);
  const sourceErrors = validateGooglePlayListingText(source);
  const sourceHash = listingSourceFingerprint(source);
  const connected = connectionState?.productId === productId && connectionState.connected;
  const byLocale = useMemo(() => new Map(listings.map((item) => [item.locale, item])), [listings]);
  useEffect(() => { latestListings.current = listings; }, [listings]);
  const outOfDateCount = GOOGLE_PLAY_TARGET_LOCALES.filter(({ locale }) => {
    const item = byLocale.get(locale);
    return item && item.sourceHash !== sourceHash;
  }).length;
  const missingCount = GOOGLE_PLAY_TARGET_LOCALES.filter(({ locale }) => !byLocale.has(locale)).length;
  const selectedToPublish = [...selectedLocales].filter((locale) => {
    if (locale === "en-US") return sourceErrors.length === 0;
    const item = byLocale.get(locale as LocalizedStoreListing["locale"]);
    return Boolean(item && item.status === "ready" && item.sourceHash === sourceHash && !validateGooglePlayListingText(item).length);
  });
  const publishingCount = selectedToPublish.length;

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/products/${productId}/connections`, { cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as { connection?: { status?: string } | null; oauthConnection?: { status?: string } | null } : null)
      .then((data) => {
        if (!cancelled) setConnectionState({ productId, connected: data?.connection?.status === "connected" || data?.oauthConnection?.status === "connected" });
      })
      .catch(() => { if (!cancelled) setConnectionState({ productId, connected: false }); });
    return () => { cancelled = true; };
  }, [productId]);

  async function saveCurrentDraft() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/products/${productId}/optimize`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(optimization),
      });
      const data = await response.json() as { error?: string; optimization?: OptimizationDraft };
      if (!response.ok || !data.optimization) throw new Error(data.error ?? "Could not save the listing draft.");
      onChange(data.optimization);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the listing draft.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function updateListing(locale: LocalizedStoreListing["locale"], next: Partial<LocalizedStoreListing>) {
    const current = byLocale.get(locale) ?? {
      locale,
      title: "",
      shortDescription: "",
      fullDescription: "",
      sourceHash,
      status: "needs-review" as const,
    };
    const changedCopy = next.title !== undefined || next.shortDescription !== undefined || next.fullDescription !== undefined;
    const updated = { ...current, ...next, ...(changedCopy ? { status: "needs-review" as const } : {}) };
    latestListings.current = [...latestListings.current.filter((item) => item.locale !== locale), updated];
    onChange({
      ...optimization,
      localizedListings: latestListings.current,
    });
    if (changedCopy) setSelectedLocales((currentSelection) => {
      const nextSelection = new Set(currentSelection);
      nextSelection.delete(locale);
      return nextSelection;
    });
  }

  async function generateOne(locale: LocalizedStoreListing["locale"], force = false, persist = true) {
    setError("");
    setNotice("");
    if (sourceErrors.length) {
      setError(`Complete the saved English listing first. ${sourceErrors.join(" ")}`);
      return null;
    }
    const previous = byLocale.get(locale);
    if (force && previous && !window.confirm(`Regenerate ${locale} from the current English source? This replaces the saved translation and returns it to review.`)) return null;
    if (persist && !await saveCurrentDraft()) return null;
    setGeneratingLocale(locale);
    try {
      const response = await fetch(`/api/products/${productId}/optimize/localizations/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale, force }),
      });
      const data = await response.json() as { error?: string; localizedListing?: LocalizedStoreListing; reused?: boolean };
      if (!response.ok || !data.localizedListing) throw new Error(data.error ?? "Could not create this translation.");
      latestListings.current = [...latestListings.current.filter((item) => item.locale !== locale), data.localizedListing];
      onChange({ ...optimization, localizedListings: latestListings.current });
      setNotice(data.reused ? `${locale} is already current; it was not generated again.` : `${locale} translation ready for your review.`);
      return data.localizedListing;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create this translation.");
      return null;
    } finally {
      setGeneratingLocale("");
    }
  }

  async function generateMissing() {
    const pending = GOOGLE_PLAY_TARGET_LOCALES.filter(({ locale }) => !byLocale.has(locale));
    if (!pending.length) {
      setNotice(outOfDateCount ? `No locales are missing. ${outOfDateCount} existing translation${outOfDateCount === 1 ? " is" : "s are"} outdated; update each one explicitly to keep control of reviewed copy.` : "All ten target locales already have a saved translation. Nothing was regenerated.");
      setError("");
      return;
    }
    if (sourceErrors.length) {
      setError(`Complete the English source listing first. ${sourceErrors.join(" ")}`);
      return;
    }
    if (!await saveCurrentDraft()) return;
    setError("");
    setNotice("");
    let completed = 0;
    for (const item of pending) {
      setBulkProgress(`Translating ${completed + 1} of ${pending.length}: ${item.label}`);
      const result = await generateOne(item.locale, false, false);
      if (!result) break;
      completed += 1;
    }
    setBulkProgress("");
    if (completed === pending.length) setNotice(`Finished ${completed} translation${completed === 1 ? "" : "s"}. Review each one before publishing.`);
  }

  async function saveDraft() {
    setError("");
    setNotice("");
    if (await saveCurrentDraft()) setNotice("English copy and translation edits saved.");
  }

  async function publishSelected() {
    const locales = selectedToPublish;
    if (!connected) {
      setError("Connect Google Play for this product in Connections before publishing.");
      return;
    }
    if (!locales.length) {
      setError("Select English or at least one reviewed translation to publish.");
      return;
    }
    const labels = locales.map((locale) => locale === "en-US" ? "English (US)" : GOOGLE_PLAY_TARGET_LOCALES.find((item) => item.locale === locale)?.label ?? locale);
    if (!window.confirm(`Submit ${productName}'s listing to Google Play for ${labels.join(", ")}? This commits the selected listings to Play Console. Google may take time to display the changes and can review them.`)) return;
    setError("");
    setNotice("");
    setPublishing(true);
    try {
      if (!await saveCurrentDraft()) return;
      const response = await fetch(`/api/products/${productId}/optimize/publish-google-play`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locales }),
      });
      const data = await response.json() as { error?: string; message?: string; publishedLocales?: string[] };
      if (!response.ok) throw new Error(data.error ?? "Google Play could not accept the listing update.");
      setNotice(data.message ?? `Submitted ${data.publishedLocales?.length ?? locales.length} locale listings to Google Play.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google Play could not accept the listing update.");
    } finally {
      setPublishing(false);
    }
  }

  return <section className="optimize-card listing-localization-card">
    <div className="optimize-card-heading">
      <div><p className="eyebrow">Google Play localization</p><h3>Keep English as the source</h3></div>
      <span>English source + 10 target locales</span>
    </div>
    <p className="field-help localization-source-note">Translations reuse the saved Optimize copy; English is never regenerated here. {fullDescriptionSource === "current-listing" ? "Because the saved long-description draft is only the short hook, Sorted reuses the existing Google Play full description instead." : "Existing translations that still match this English source are reused."}</p>
    <div className="localization-bulk-actions">
      <button type="button" className="secondary-button" onClick={() => void generateMissing()} disabled={Boolean(generatingLocale || bulkProgress || saving || publishing || sourceErrors.length || missingCount === 0)}>
        {bulkProgress || `Translate missing (${missingCount})`}
      </button>
      <span>{missingCount} missing · {outOfDateCount} outdated</span>
    </div>
    <div className="store-locale-source">
      <label className="locale-publish-choice"><input type="checkbox" checked={selectedLocales.has("en-US")} disabled={sourceErrors.length > 0} onChange={(event) => setSelectedLocales((current) => { const next = new Set(current); if (event.target.checked) next.add("en-US"); else next.delete("en-US"); return next; })} /><span><strong>English (United States)</strong><small>Use the existing Optimize copy as-is · {sourceErrors.length ? "complete source fields first" : "source listing"}</small></span></label>
    </div>
    <div className="localization-grid store-localization-grid">
      {GOOGLE_PLAY_TARGET_LOCALES.map(({ locale, label }) => {
        const item = byLocale.get(locale);
        const stale = Boolean(item && item.sourceHash !== sourceHash);
        const fieldErrors = item ? validateGooglePlayListingText(item) : [];
        const ready = Boolean(item && item.status === "ready" && !stale && !fieldErrors.length);
        const busy = generatingLocale === locale;
        return <article className={`store-locale-row ${stale ? "outdated" : ""}`} key={locale}>
          <div className="store-locale-heading">
            <div><strong>{label}</strong><small>{locale} · {stale ? "English source changed" : item ? item.status === "ready" ? "Reviewed" : "Needs review" : "Not translated yet"}</small></div>
            <div className="store-locale-actions">
              {item && <label className="locale-publish-choice"><input type="checkbox" checked={selectedLocales.has(locale)} disabled={!ready || Boolean(generatingLocale || bulkProgress || publishing)} onChange={(event) => setSelectedLocales((current) => { const next = new Set(current); if (event.target.checked) next.add(locale); else next.delete(locale); return next; })} /><span>Publish</span></label>}
              {item && <label className="locale-review-choice"><input type="checkbox" checked={item.status === "ready" && !stale && !fieldErrors.length} disabled={Boolean(generatingLocale || bulkProgress || publishing || fieldErrors.length || stale)} onChange={(event) => updateListing(locale, { status: event.target.checked ? "ready" : "needs-review" })} /><span>Reviewed</span></label>}
              <button type="button" className="text-button" disabled={Boolean(generatingLocale || bulkProgress || saving || publishing || sourceErrors.length)} onClick={() => void generateOne(locale, Boolean(item))}>{busy ? "Translating…" : item ? stale ? "Update" : "Regenerate" : "Generate"}</button>
            </div>
          </div>
          {item ? <div className="store-locale-fields">
            <label>Localized title<input maxLength={30} value={item.title} onChange={(event) => updateListing(locale, { title: event.target.value })} /><small>{item.title.length}/30</small></label>
            <label>Short description<textarea maxLength={80} rows={2} value={item.shortDescription} onChange={(event) => updateListing(locale, { shortDescription: event.target.value })} /><small>{item.shortDescription.length}/80</small></label>
            <label>Full description<textarea maxLength={4000} rows={5} value={item.fullDescription} onChange={(event) => updateListing(locale, { fullDescription: event.target.value })} /><small>{item.fullDescription.length}/4000</small></label>
            {fieldErrors.length > 0 && <small className="localization-error">{fieldErrors.join(" ")}</small>}
          </div> : <p className="store-locale-empty">Generate this translation from the saved English listing, then review and edit it here.</p>}
        </article>;
      })}
    </div>
    {error && <p className="localization-error" role="alert">{error}</p>}
    {notice && <p className="localization-notice" role="status">{notice}</p>}
    <div className="localization-footer">
      <span>{connected ? "Changes are only sent when you press the publish button." : "Connect a Google Play account to enable publishing."}</span>
      <div className="workflow-action-buttons">
        <button type="button" className="secondary-button" disabled={saving || publishing || Boolean(generatingLocale || bulkProgress)} onClick={() => void saveDraft()}>{saving ? "Saving…" : "Save translations"}</button>
        <button type="button" className="primary-button" disabled={!connected || !publishingCount || saving || publishing || Boolean(generatingLocale || bulkProgress)} onClick={() => void publishSelected()}>{publishing ? "Submitting…" : `Push ${publishingCount} locale${publishingCount === 1 ? "" : "s"} to Google Play`}</button>
      </div>
    </div>
  </section>;
}
