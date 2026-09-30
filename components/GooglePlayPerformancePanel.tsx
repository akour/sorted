"use client";

import { useEffect, useRef, useState } from "react";

type PerformanceRow = {
  id: number;
  reportDate: string;
  countryCode: string;
  dailyViewers: number | null;
  rolling28Viewers: number | null;
  dailyConverters: number | null;
  rolling28Converters: number | null;
  dailyConversionRate: string | null;
  rolling28ConversionRate: string | null;
  importedAt: string;
};

function count(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("en").format(value);
}

export function GooglePlayPerformancePanel({ eventId, consoleEventId, consoleEventIdSaved, onConsoleEventIdChange }: {
  eventId?: number;
  consoleEventId: string;
  consoleEventIdSaved: boolean;
  onConsoleEventIdChange: (value: string) => void;
}) {
  const [metrics, setMetrics] = useState<PerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!eventId) {
      return;
    }
    const controller = new AbortController();
    fetch(`/api/calendar/${eventId}/performance`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load performance data.");
        setMetrics(Array.isArray(data.metrics) ? data.metrics : []);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load performance data.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [eventId]);

  async function importReport() {
    if (!eventId || !file || !consoleEventIdSaved) return;
    setImporting(true);
    setError("");
    setNotice("");
    try {
      if (file.size > 2_000_000) throw new Error("Choose a CSV under 2 MB or export a shorter date range.");
      const response = await fetch(`/api/calendar/${eventId}/performance`, {
        method: "POST",
        headers: { "content-type": "text/csv; charset=utf-8" },
        body: await file.text(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not import this report.");
      setMetrics(Array.isArray(data.metrics) ? data.metrics : []);
      setNotice(`Imported ${data.importedRows} report rows. Re-importing updates the same dates safely.`);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not import this report.");
    } finally {
      setImporting(false);
    }
  }

  const latestDate = metrics[0]?.reportDate;
  const latestRows = latestDate ? metrics.filter((row) => row.reportDate === latestDate) : [];
  const isLoading = Boolean(eventId) && loading;

  return <section className="event-card performance-panel">
    <div className="event-card-heading"><div><p className="eyebrow">Google Play results</p><h3>Close the loop on this event</h3><span>Import the event’s Play Console report to compare plan with outcomes.</span></div></div>
    <label>Google Play Console event ID<span className="field-help">Copy the unique ID shown in Play Console when you view this event. Save the event before importing.</span><input value={consoleEventId} onChange={(event) => onConsoleEventIdChange(event.target.value)} placeholder="For example, 123456" autoComplete="off" /></label>
    {!consoleEventIdSaved && <p className="workflow-action-help">Save this event and its Console ID before choosing a report.</p>}
    <div className="event-form-grid performance-import-controls">
      <label>Promotional content report CSV<input ref={fileInput} type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} disabled={!eventId || !consoleEventIdSaved || importing} /></label>
      <div className="performance-import-action"><button className="secondary-button" type="button" onClick={() => void importReport()} disabled={!file || !eventId || !consoleEventIdSaved || importing}>{importing ? "Importing…" : "Import report"}</button><span className="field-help">Download one event at a time from Play Console → Promotional content reports → Download CSV.</span></div>
    </div>
    {error && <p className="date-error" role="alert">{error}</p>}
    {notice && <p className="field-help" role="status">{notice}</p>}
    <p className="field-help">Daily and rolling 28-day figures are kept separate. Conversion-rate cells are shown exactly as exported; Sorted does not guess their percentage encoding.</p>
    {isLoading ? <div className="loading-line">Loading imported results…</div> : latestRows.length > 0 ? <>
      <div className="performance-latest-heading"><strong>Latest report date: {latestDate}</strong><span>{metrics.length} saved date/country rows</span></div>
      <div className="performance-table-scroll"><table className="performance-table"><thead><tr><th>Country</th><th>Viewers<br /><small>day / rolling 28d</small></th><th>Converters<br /><small>day / rolling 28d</small></th><th>Conversion rate<br /><small>daily / rolling 28d · CSV</small></th></tr></thead><tbody>{latestRows.map((row) => <tr key={row.id}><th scope="row">{row.countryCode}</th><td>{count(row.dailyViewers)} / {count(row.rolling28Viewers)}</td><td>{count(row.dailyConverters)} / {count(row.rolling28Converters)}</td><td>{row.dailyConversionRate ?? "—"} / {row.rolling28ConversionRate ?? "—"}</td></tr>)}</tbody></table></div>
    </> : <div className="loading-line">{metrics.length ? "No report rows for the most recent date." : "No Play performance report imported yet."}</div>}
    <p className="field-help"><a href="https://support.google.com/googleplay/android-developer/answer/12932124?hl=en" target="_blank" rel="noreferrer">Google’s report guide</a> · one event per export prevents aggregate data from being attached to the wrong plan.</p>
  </section>;
}
