"use client";

import { useEffect, useState } from "react";

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
  source?: { lastSyncedAt: string | null } | null;
  imports?: PromoReportImport[];
  events?: PromoReportSummary[];
  dataTruncated?: boolean;
  error?: string;
};

function formatPercent(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function formatMetric(value: number | null) {
  return value === null ? "—" : value.toLocaleString();
}

export function GooglePlayPromoInsights({ productId, productName }: { productId: number; productName: string }) {
  const [state, setState] = useState<PromoReportState>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    void fetch(`/api/products/${productId}/performance/promotional-content`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as PromoReportState;
        if (!response.ok) throw new Error(data.error?.trim() || "Could not load saved promotional report history.");
        if (current) setState(data);
      })
      .catch((loadError: unknown) => {
        if (current) setError(loadError instanceof Error ? loadError.message : "Could not load saved promotional report history.");
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [productId]);

  const events = state.events ?? [];
  const viewersObserved = events.some((event) => event.viewers !== null);
  const convertersObserved = events.some((event) => event.converters !== null);
  const totalViewers = events.reduce((sum, event) => sum + (event.viewers ?? 0), 0);
  const totalConverters = events.reduce((sum, event) => sum + (event.converters ?? 0), 0);
  const totalConversionRate = viewersObserved && convertersObserved && totalViewers > 0 ? totalConverters / totalViewers : null;

  return <section className="performance-api-panel promo-report-panel" aria-labelledby={`promo-report-title-${productId}`}>
    <div className="performance-api-heading">
      <div>
        <p className="eyebrow">Event learning loop</p>
        <strong id={`promo-report-title-${productId}`}>Promotional content performance</strong>
        <span>Performance history for {productName}, when available.</span>
      </div>
    </div>

    <div className="promo-report-unavailable" role="status">
      <span className="promo-report-badge">Not available yet</span>
      <div>
        <strong>Automatic report access isn’t supported yet</strong>
        <p>Google Play keeps these reports in a private Cloud Storage bucket, and Sorted doesn’t have a documented way to discover and connect it through Google sign-in. We won’t ask you to create cloud credentials or paste a bucket ID. This feature will stay paused until Sorted can connect it automatically.</p>
      </div>
    </div>

    {loading && <p className="performance-empty">Loading saved report history…</p>}
    {!loading && !events.length && !error && <p className="performance-empty">No promotional report history has been imported for this product. There’s nothing you need to configure.</p>}

    {events.length > 0 && <>
      <p className="performance-row-note">Previously imported report observations · no new report syncs are being run.</p>
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
    {state.source?.lastSyncedAt && <p className="performance-row-note">Last imported {new Date(state.source.lastSyncedAt).toLocaleString()} · {state.imports?.length ?? 0} report file{state.imports?.length === 1 ? "" : "s"} retained for {productName}.</p>}
    <p className="performance-api-footnote">This panel is read-only. Existing imported history is preserved; the app no longer asks for report keys, bucket IDs, or manual syncs.</p>
  </section>;
}
