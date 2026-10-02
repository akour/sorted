"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildPlayPerformanceRows,
  parsePlayConsoleCsv,
  PLAY_PERFORMANCE_FIELDS,
  PLAY_PERFORMANCE_FIELD_LABELS,
  playPerformanceReportLabel,
  suggestPlayPerformanceMapping,
  type ParsedPlayCsv,
  type PlayPerformanceField,
  type PlayPerformanceMapping,
  type PlayPerformanceReportType,
  type PlayPerformanceRow,
} from "../lib/google-play-performance";

type SavedImport = {
  id: number;
  reportType: "click-intent" | "legacy-acquisition" | "mixed";
  fileName: string;
  rowCount: number;
  dateStart: string;
  dateEnd: string;
  createdAt: string;
};

type ReportResponse = { imports?: SavedImport[]; rows?: PlayPerformanceRow[]; selectedImportId?: number | null; error?: string };

async function requestReports(productId: number, importId?: number | null) {
  const suffix = importId ? `?importId=${importId}` : "";
  const response = await fetch(`/api/products/${productId}/performance${suffix}`);
  const data = await response.json() as ReportResponse;
  if (!response.ok) throw new Error(errorMessage(data, "Could not load imported reports."));
  return data;
}

function errorMessage(value: unknown, fallback: string) {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : fallback;
}

export function GooglePlayPerformanceImporter({ productId, productName }: { productId: number; productName: string }) {
  const [imports, setImports] = useState<SavedImport[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [savedRows, setSavedRows] = useState<PlayPerformanceRow[]>([]);
  const [parsed, setParsed] = useState<ParsedPlayCsv | null>(null);
  const [mapping, setMapping] = useState<PlayPerformanceMapping>({});
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadReports(importId?: number | null) {
    setLoading(true);
    try {
      const data = await requestReports(productId, importId);
      setImports(data.imports ?? []);
      setSelectedId(data.selectedImportId ?? null);
      setSavedRows(data.rows ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load imported reports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let current = true;
    void requestReports(productId).then((data) => {
      if (!current) return;
      setImports(data.imports ?? []);
      setSelectedId(data.selectedImportId ?? null);
      setSavedRows(data.rows ?? []);
    }).catch((loadError: unknown) => {
      if (current) setError(loadError instanceof Error ? loadError.message : "Could not load imported reports.");
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [productId]);

  const preview = useMemo<{ rows: PlayPerformanceRow[]; reportType: PlayPerformanceReportType | null; validationError: string }>(() => {
    if (!parsed) return { rows: [], reportType: null, validationError: "" };
    try {
      const result = buildPlayPerformanceRows(parsed.headers, parsed.rows, mapping);
      return { ...result, validationError: "" };
    } catch (previewError) {
      return { rows: [] as PlayPerformanceRow[], reportType: null, validationError: previewError instanceof Error ? previewError.message : "Review the selected columns." };
    }
  }, [parsed, mapping]);

  async function chooseFile(file?: File) {
    setError(""); setNotice(""); setParsed(null); setSavedRows([]);
    if (!file) return;
    if (!file.name.toLocaleLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      setError("Choose a CSV export from Google Play Console. Spreadsheet files are not supported yet."); return;
    }
    if (file.size > 5 * 1024 * 1024) { setError("This CSV is larger than 5 MB. Export a smaller date range and try again."); return; }
    try {
      const result = parsePlayConsoleCsv(await file.text());
      if (result.rows.length > 2_000) { setError("This CSV has more than 2,000 rows. Export a smaller date range and try again."); return; }
      setParsed(result);
      setMapping(suggestPlayPerformanceMapping(result.headers));
      setFileName(file.name);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Could not read this CSV file.");
    }
  }

  function setField(field: PlayPerformanceField, value: string) {
    setMapping((current) => ({ ...current, [field]: value === "" ? null : Number(value) }));
  }

  async function importReport() {
    if (!parsed || preview.validationError || !preview.rows.length) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/products/${productId}/performance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName, rows: preview.rows }),
      });
      const data = await response.json() as { import?: SavedImport; duplicate?: boolean; message?: string; error?: string };
      if (!response.ok) throw new Error(errorMessage(data, "Could not save this report."));
      if (!data.import) throw new Error("The report was saved, but Sorted could not confirm its details. Refresh the report list before trying again.");
      setParsed(null); setFileName("");
      await loadReports(data.import.id);
      setNotice(data.duplicate ? data.message ?? "This exact report is already saved." : `Imported ${data.import.rowCount.toLocaleString()} rows for ${productName}.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Could not save this report.");
    } finally { setBusy(false); }
  }

  async function selectImport(id: number) {
    setSelectedId(id);
    await loadReports(id);
  }

  async function deleteImport(report: SavedImport) {
    if (!window.confirm(`Delete the imported ${report.rowCount.toLocaleString()}-row report “${report.fileName}”? This removes only the normalized data saved for ${productName}.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/products/${productId}/performance/${report.id}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(errorMessage(data, "Could not remove this report."));
      await loadReports();
      setNotice("Imported report removed.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not remove this report.");
    } finally { setBusy(false); }
  }

  const currentImport = imports.find((item) => item.id === selectedId) ?? null;
  const mappedIndexes = new Set(Object.values(mapping).filter((value): value is number => typeof value === "number"));
  const unmappedHeaders = parsed?.headers.filter((_, index) => !mappedIndexes.has(index)) ?? [];

  return <section className="optimize-card performance-importer" aria-labelledby={`performance-title-${productId}`}>
    <div className="optimize-card-heading">
      <div><p className="eyebrow">Evidence from Play Console</p><h3 id={`performance-title-${productId}`}>Google Play performance</h3></div>
      <span>{imports.length} report{imports.length === 1 ? "" : "s"}</span>
    </div>
    <p className="performance-intro">Import a Store listing performance CSV to keep this product’s click, locale, and acquisition observations beside its ASO work. The original CSV stays in your browser; mapped observations are saved to Sorted. When you generate an optimization plan, up to 30 rows from the latest report are included in the request to your configured AI provider.</p>
    <div className="performance-source-note"><strong>Keep the metrics distinct.</strong> Current listing-performance exports can include unique install/open/pre-registration clicks and CTR. Older acquisition reports measure a different outcome; Sorted labels them separately and never converts installs into listing clicks.</div>

    {imports.length > 0 && <div className="performance-saved-tools">
      <label>Saved report<select value={selectedId ?? ""} onChange={(event) => void selectImport(Number(event.target.value))} disabled={busy || loading}>
        {imports.map((report) => <option key={report.id} value={report.id}>{report.fileName} · {playPerformanceReportLabel(report.reportType)} · {report.rowCount.toLocaleString()} rows</option>)}
      </select></label>
      {currentImport && <button type="button" className="performance-delete" onClick={() => void deleteImport(currentImport)} disabled={busy}>Delete report</button>}
    </div>}

    <div className="performance-upload-row">
      <label className="performance-file-label">Choose a Play Console CSV<input type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; void chooseFile(file); }} /></label>
      <span>CSV only · max 5 MB · up to 2,000 rows</span>
    </div>

    {error && <p className="performance-error" role="alert">{error}</p>}
    {notice && <p className="performance-notice" role="status">{notice}</p>}
    {parsed && <div className="performance-preview">
      <div className="performance-preview-heading"><div><strong>Review before import</strong><small>{fileName} · {parsed.rows.length.toLocaleString()} rows · delimiter {parsed.delimiter === "\t" ? "tab" : parsed.delimiter}</small></div><span>{preview.reportType ? playPerformanceReportLabel(preview.reportType) : "Needs column mapping"}</span></div>
      <p className="performance-mapping-help">Confirm each field mapping. Unknown columns stay out of the import. Count fields require whole numbers; CTR text is kept exactly as exported, and dates are not reformatted.</p>
      <div className="performance-mapping-grid">
        {PLAY_PERFORMANCE_FIELDS.map((field) => <label key={field}>{PLAY_PERFORMANCE_FIELD_LABELS[field]}<select value={typeof mapping[field] === "number" ? mapping[field] : ""} onChange={(event) => setField(field, event.target.value)}>
          <option value="">Not included</option>{parsed.headers.map((header, index) => <option key={`${index}-${header}`} value={index}>{header}</option>)}
        </select></label>)}
      </div>
      {unmappedHeaders.length > 0 && <p className="performance-unmapped"><strong>Not imported:</strong> {unmappedHeaders.join(" · ")}</p>}
      {preview.validationError && <p className="performance-error" role="alert">{preview.validationError}</p>}
      {!preview.validationError && <>
        <div className="performance-table-wrap"><table className="performance-table"><thead><tr><th>CSV row</th><th>Date</th><th>Locale</th><th>Country</th><th>Visitors</th><th>Install clicks</th><th>Open clicks</th><th>Pre-reg clicks</th><th>CTR</th><th>Acquisition conversion</th><th>Acquisitions</th></tr></thead><tbody>
          {preview.rows.slice(0, 5).map((row) => <PerformanceTableRow key={row.sourceRow} row={row} />)}
        </tbody></table></div>
        <p className="performance-row-note">Previewing {Math.min(5, preview.rows.length)} of {preview.rows.length.toLocaleString()} rows. All mapped rows must validate before saving.</p>
      </>}
      <div className="performance-actions"><button className="secondary-button" type="button" onClick={() => { setParsed(null); setFileName(""); setError(""); }} disabled={busy}>Cancel</button><button className="primary-button" type="button" onClick={() => void importReport()} disabled={busy || loading || Boolean(preview.validationError) || !preview.rows.length}>{busy ? "Importing…" : `Import ${preview.rows.length.toLocaleString()} rows`}</button></div>
    </div>}

    {loading ? <p className="performance-empty">Loading reports…</p> : currentImport ? <>
      <div className="performance-report-summary"><div><strong>{playPerformanceReportLabel(currentImport.reportType)}</strong><span>{currentImport.rowCount.toLocaleString()} normalized observations · saved {new Date(currentImport.createdAt).toLocaleDateString()}</span></div><span>{currentImport.dateStart && currentImport.dateEnd ? `${currentImport.dateStart}${currentImport.dateEnd === currentImport.dateStart ? "" : ` – ${currentImport.dateEnd}`}` : "Dates shown as exported"}</span></div>
      <div className="performance-table-wrap"><table className="performance-table saved"><thead><tr><th>Date</th><th>Locale</th><th>Country</th><th>Search term</th><th>Visitors</th><th>Install clicks</th><th>Open clicks</th><th>Pre-reg clicks</th><th>CTR</th><th>Acquisition conversion</th><th>Acquisitions</th></tr></thead><tbody>
        {savedRows.map((row) => <PerformanceTableRow key={row.sourceRow} row={row} includeSearch />)}
      </tbody></table></div>
      {currentImport.reportType === "legacy-acquisition" && <p className="performance-row-note">This export does not contain listing click-through metrics, so it cannot answer which listing copy earned more unique Play Console clicks.</p>}
    </> : !parsed && <p className="performance-empty">No reports imported for this product yet. Choose a CSV to preview the fields and rows before saving.</p>}
  </section>;
}

function PerformanceTableRow({ row, includeSearch = false }: { row: PlayPerformanceRow; includeSearch?: boolean }) {
  return <tr>{includeSearch && <td>{row.date || "—"}</td>}{!includeSearch && <td>{row.sourceRow}</td>}{!includeSearch && <td>{row.date || "—"}</td>}<td>{row.locale || "—"}</td><td>{row.country || "—"}</td>{includeSearch && <td>{row.searchTerm || row.trafficSource || "—"}</td>}<td>{row.visitors ?? "—"}</td><td>{row.installClicks ?? "—"}</td><td>{row.openClicks ?? "—"}</td><td>{row.preRegistrationClicks ?? "—"}</td><td>{row.ctr || "—"}</td><td>{row.conversionRate || "—"}</td><td>{row.acquisitions ?? "—"}</td></tr>;
}
