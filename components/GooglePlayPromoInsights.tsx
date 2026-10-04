"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

type PromoReportSummary = {
  eventIds: string;
  eventNames: string;
  viewers: number | null;
  converters: number | null;
  conversionRate: number | null;
  countries: number;
  firstDate: string;
  lastDate: string;
};
type PromoReportImport = { id: number; reportMonth: string; fileName: string; rowCount: number; createdAt: string };
type PromoReportState = {
  source?: { bucketName: string; credentialHint?: string; hasDedicatedCredential?: boolean; lastSyncedAt: string | null; lastError: string | null } | null;
  serviceAccountAvailable?: boolean;
  serviceAccountHint?: string;
  serviceAccountStatus?: string | null;
  imports?: PromoReportImport[];
  events?: PromoReportSummary[];
  error?: string;
  message?: string;
  importedFiles?: number;
  importedRows?: number;
  dataTruncated?: boolean;
};

function errorMessage(value: PromoReportState, fallback: string) {
  return value.error?.trim() || fallback;
}

function formatPercent(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function formatMetric(value: number | null) {
  return value === null ? "—" : value.toLocaleString();
}

export function GooglePlayPromoInsights({ productId, productName, onOpenConnections }: { productId: number; productName: string; onOpenConnections: () => void }) {
  const [state, setState] = useState<PromoReportState>({});
  const [bucketName, setBucketName] = useState("");
  const [serviceAccountFile, setServiceAccountFile] = useState<File | null>(null);
  const serviceAccountFileInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/products/${productId}/performance/promotional-content`, { cache: "no-store" });
    const data = await response.json() as PromoReportState;
    if (!response.ok) throw new Error(errorMessage(data, "Could not load promotional content reports."));
    return data;
  }, [productId]);

  const sync = useCallback(async (quiet = false) => {
    setSyncing(true);
    if (!quiet) { setError(""); setNotice(""); }
    try {
      const response = await fetch(`/api/products/${productId}/performance/promotional-content`, { method: "POST" });
      const data = await response.json() as PromoReportState;
      if (!response.ok) throw new Error(errorMessage(data, "Could not sync promotional content reports."));
      setState(data);
      setNotice(data.message ?? "Google Play promotional reports are up to date.");
      setError(data.source?.lastError ?? "");
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Could not sync promotional content reports.");
    } finally {
      setSyncing(false);
    }
  }, [productId]);

  useEffect(() => {
    let current = true;
    void load().then((data) => {
      if (!current) return;
      setState(data);
      setBucketName(data.source?.bucketName ?? "");
      setError(data.source?.lastError ?? "");
      const lastSync = data.source?.lastSyncedAt ? Date.parse(data.source.lastSyncedAt) : 0;
      const stale = !Number.isFinite(lastSync) || Date.now() - lastSync >= 24 * 60 * 60 * 1000;
      if (data.source && data.serviceAccountAvailable && stale && !data.source.lastError) void sync(true);
    }).catch((loadError: unknown) => {
      if (current) setError(loadError instanceof Error ? loadError.message : "Could not load promotional content reports.");
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [load, sync]);

  async function saveBucket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setNotice("");
    try {
      let serviceAccountJson = "";
      if (serviceAccountFile) {
        if (serviceAccountFile.size > 64 * 1024) throw new Error("That key file is unexpectedly large. Choose the JSON key downloaded from Google Cloud.");
        serviceAccountJson = await serviceAccountFile.text();
        let parsed: unknown;
        try { parsed = JSON.parse(serviceAccountJson); }
        catch { throw new Error("That file is not valid JSON. Choose the service-account key downloaded from Google Cloud."); }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || typeof (parsed as Record<string, unknown>).client_email !== "string" || typeof (parsed as Record<string, unknown>).private_key !== "string") {
          throw new Error("That JSON file does not look like a Google service-account key.");
        }
      }
      const response = await fetch(`/api/products/${productId}/performance/promotional-content`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bucketName, serviceAccountJson }),
      });
      const data = await response.json() as PromoReportState;
      if (!response.ok) throw new Error(errorMessage(data, "Could not verify the Google Play reports bucket."));
      setState((current) => ({ ...current, ...data, source: data.source }));
      setBucketName(data.source?.bucketName ?? bucketName);
      setServiceAccountFile(null);
      if (serviceAccountFileInput.current) serviceAccountFileInput.current.value = "";
      setNotice(data.message ?? "Report bucket access verified.");
      await sync(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not verify the Google Play reports bucket.");
    } finally {
      setSaving(false);
    }
  }

  async function fillBucketFromClipboard() {
    setError(""); setNotice("");
    try {
      if (!navigator.clipboard?.readText) throw new Error("Clipboard access is unavailable here. Copy the Play Console reports URI again, or enter its bucket ID below.");
      const copied = (await navigator.clipboard.readText()).trim();
      const bucket = copied.replace(/^gs:\/\//i, "").replace(/\/$/, "");
      if (!/^pubsite_prod_rev_[a-zA-Z0-9_-]{4,80}$/.test(bucket)) throw new Error("The clipboard does not contain a Google Play report bucket. Copy the Cloud Storage URI from Play Console first.");
      setBucketName(bucket);
      setNotice("Play Console reports bucket filled from your clipboard.");
    } catch (clipboardError) {
      setError(clipboardError instanceof Error ? clipboardError.message : "Could not read the copied reports URI.");
    }
  }

  async function disconnectSource() {
    if (!window.confirm("Disconnect this promotional report source? Saved credentials and the bucket ID will be removed, but imported report observations will remain.")) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/products/${productId}/performance/promotional-content`, { method: "DELETE" });
      const data = await response.json() as PromoReportState;
      if (!response.ok) throw new Error(errorMessage(data, "Could not disconnect the promotional report source."));
      const next = await load();
      setState(next);
      setBucketName(next.source?.bucketName ?? "");
      setNotice(data.message ?? "Promotional report source disconnected. Imported observations were kept.");
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Could not disconnect the promotional report source.");
    } finally { setSaving(false); }
  }

  const events = state.events ?? [];
  const viewersObserved = events.some((event) => event.viewers !== null);
  const convertersObserved = events.some((event) => event.converters !== null);
  const totalViewers = events.reduce((sum, event) => sum + (event.viewers ?? 0), 0);
  const totalConverters = events.reduce((sum, event) => sum + (event.converters ?? 0), 0);
  const totalConversionRate = viewersObserved && convertersObserved && totalViewers > 0 ? totalConverters / totalViewers : null;
  const busy = saving || syncing;

  return <section className="performance-api-panel promo-report-panel" aria-labelledby={`promo-report-title-${productId}`}>
    <div className="performance-api-heading">
      <div><p className="eyebrow">Event learning loop</p><strong id={`promo-report-title-${productId}`}>Promotional content performance</strong><span>Bring daily viewers and converters from this app’s private Play Console report bucket into Sorted.</span></div>
      <button className="secondary-button" type="button" onClick={() => void sync()} disabled={!state.source || !state.serviceAccountAvailable || busy}>{syncing ? "Syncing…" : state.imports?.length ? "Sync reports" : "Sync from Google Play"}</button>
    </div>

    {!state.serviceAccountAvailable && <div className="promo-report-setup-note"><span>Connect a read-only Google service account below, or save one in this product’s Connections. Google OAuth sign-in alone does not grant access to private monthly report files.</span><button className="secondary-button" type="button" onClick={onOpenConnections}>Open Connections</button></div>}

    <form className="promo-report-config" onSubmit={(event) => void saveBucket(event)}>
      <label className="promo-report-bucket">Play Console reports bucket<span className="field-help">In Play Console, copy the Cloud Storage URI from Download reports, then fill it here with one click. It starts with gs://pubsite_prod_rev_…</span><span className="promo-bucket-row"><input value={bucketName} onChange={(event) => setBucketName(event.target.value)} placeholder="gs://pubsite_prod_rev_1234567890" autoComplete="off" spellCheck={false} disabled={busy} /><button className="secondary-button" type="button" onClick={() => void fillBucketFromClipboard()} disabled={busy}>Use copied URI</button></span></label>
      <label className="promo-report-key">Read-only service-account key file<span className="field-help">Choose the JSON key downloaded from Google Cloud. The file contents are never displayed and are encrypted before storage.{state.serviceAccountHint ? ` Saved credential ${state.serviceAccountHint}.` : ""}</span><input className="promo-key-file" ref={serviceAccountFileInput} type="file" accept=".json,application/json" onChange={(event) => { setServiceAccountFile(event.target.files?.[0] ?? null); setError(""); }} disabled={busy} aria-label="Choose Google service-account JSON key file" />{!serviceAccountFile && state.serviceAccountAvailable && <span className="field-help">No need to choose it again; Sorted will reuse the saved credential.</span>}</label>
      <button className="secondary-button" type="submit" disabled={busy || (!state.serviceAccountAvailable && !serviceAccountFile) || !bucketName.trim()}>{saving ? "Checking access…" : "Save & test access"}</button>
    </form>

    {loading && <p className="performance-empty">Checking report connection…</p>}
    {!loading && state.source && state.serviceAccountAvailable && !events.length && !error && <p className="performance-empty">{state.imports?.length ? "The latest reports contain no daily outcome rows for this app." : "No promotional reports are imported yet. Sync looks for the six newest monthly exports; Play Console may take several days to publish each report."}</p>}

    {events.length > 0 && <>
      <div className="performance-quality-grid promo-report-metrics">
        <div className="performance-quality-card"><span>Unique viewers · daily total</span><strong>{viewersObserved ? totalViewers.toLocaleString() : "—"}</strong></div>
        <div className="performance-quality-card"><span>Unique converters · daily total</span><strong>{convertersObserved ? totalConverters.toLocaleString() : "—"}</strong></div>
        <div className="performance-quality-card"><span>Viewer → action</span><strong>{formatPercent(totalConversionRate)}</strong></div>
      </div>
      <div className="performance-table-wrap"><table className="performance-table saved"><thead><tr><th>Play Console event</th><th>Daily viewers</th><th>Daily converters</th><th>Conversion</th><th>Countries</th><th>Report dates</th></tr></thead><tbody>
        {events.map((event) => <tr key={`${event.eventIds}-${event.eventNames}`}><td><strong>{event.eventNames}</strong>{event.eventIds && <small>{event.eventIds}</small>}</td><td>{formatMetric(event.viewers)}</td><td>{formatMetric(event.converters)}</td><td>{formatPercent(event.conversionRate)}</td><td>{event.countries || "—"}</td><td>{event.firstDate}{event.lastDate !== event.firstDate ? ` – ${event.lastDate}` : ""}</td></tr>)}
      </tbody></table></div>
      <p className="performance-row-note">Daily values only. Google’s rolling 28-day figures are preserved in the imported report but not summed, which would double-count users. These are Play Console observations, not proof that an event caused an app-wide change.</p>
      {state.dataTruncated && <p className="performance-row-note">This view reached the display limit, so it shows the newest observations first.</p>}
    </>}

    {error && <p className="performance-error" role="alert">{error}</p>}
    {notice && <p className="performance-notice" role="status">{notice}</p>}
    {state.source?.lastSyncedAt && <p className="performance-row-note">Last checked {new Date(state.source.lastSyncedAt).toLocaleString()} · {state.imports?.length ?? 0} recent monthly report{state.imports?.length === 1 ? "" : "s"} available for {productName}.</p>}
    {state.source && <button type="button" className="performance-delete promo-report-disconnect" onClick={() => void disconnectSource()} disabled={busy}>Disconnect report source</button>}
    <p className="performance-api-footnote">Read-only access is limited to this product’s promotional-content folder. The service account needs Global “View app information” in Play Console; Sorted never writes or submits event content to Google Play.</p>
  </section>;
}
