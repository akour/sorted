"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  GOOGLE_PLAY_EXPERIMENT_FIELDS,
  GOOGLE_PLAY_EXPERIMENT_OUTCOMES,
  GOOGLE_PLAY_EXPERIMENT_OUTCOME_LABELS,
  type GooglePlayExperimentField,
  type GooglePlayExperimentOutcome,
} from "../lib/google-play-experiments";

type ListingSnapshot = {
  fetchSource?: string;
  language?: string;
  fetchedAt?: string;
  shortDescription?: string;
  longDescription?: string;
};

type Experiment = {
  id: number;
  locale: string;
  field: GooglePlayExperimentField;
  hypothesis: string;
  baselineText: string;
  variantText: string;
  baselineFetchedAt: string;
  primaryMetric: string;
  status: "planned" | "running" | "completed" | "cancelled";
  outcome: GooglePlayExperimentOutcome | null;
  outcomeNotes: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

type Props = {
  productId: number;
  listing: ListingSnapshot;
  shortDescriptionDraft: string;
  fullDescriptionDraft: string;
};

const PLAY_EXPERIMENTS_GUIDE = "https://support.google.com/googleplay/android-developer/answer/12053285";

function formatDate(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "date not recorded";
  return new Date(value).toLocaleString();
}

function fieldValue(listing: ListingSnapshot, field: GooglePlayExperimentField) {
  return field === "shortDescription" ? listing.shortDescription ?? "" : listing.longDescription ?? "";
}

function fieldCharacterCount(value: string) {
  return [...value].length;
}

async function readApiPayload(response: Response): Promise<Record<string, unknown>> {
  const payload: unknown = await response.json().catch(() => null);
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
}

function isExperiment(value: unknown): value is Experiment {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "number"
    && typeof item.locale === "string"
    && (item.field === "shortDescription" || item.field === "fullDescription")
    && typeof item.hypothesis === "string"
    && typeof item.baselineText === "string"
    && typeof item.variantText === "string"
    && typeof item.baselineFetchedAt === "string"
    && typeof item.primaryMetric === "string"
    && (item.status === "planned" || item.status === "running" || item.status === "completed" || item.status === "cancelled")
    && (item.outcome === null || GOOGLE_PLAY_EXPERIMENT_OUTCOMES.includes(item.outcome as GooglePlayExperimentOutcome))
    && typeof item.outcomeNotes === "string"
    && (typeof item.startedAt === "string" || item.startedAt === null)
    && (typeof item.completedAt === "string" || item.completedAt === null)
    && typeof item.createdAt === "string";
}

function experimentArray(value: unknown): Experiment[] {
  return Array.isArray(value) ? value.filter(isExperiment) : [];
}

function payloadError(payload: Record<string, unknown>, fallback: string) {
  return typeof payload.error === "string" ? payload.error : fallback;
}

function statusLabel(status: Experiment["status"]) {
  return status === "planned" ? "Plan ready" : status === "running" ? "In progress" : status === "completed" ? "Completed" : "Cancelled";
}

export function GooglePlayExperimentPanel({ productId, listing, shortDescriptionDraft, fullDescriptionDraft }: Props) {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyExperimentId, setBusyExperimentId] = useState<number | null>(null);
  const [field, setField] = useState<GooglePlayExperimentField>("shortDescription");
  const [variant, setVariant] = useState(shortDescriptionDraft);
  const [hypothesis, setHypothesis] = useState("The variant makes the product's main value clearer; compare it with the current listing in Play Console.");
  const [outcomeExperimentId, setOutcomeExperimentId] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<GooglePlayExperimentOutcome>("variant_better");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadExperiments = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/products/${productId}/optimize/experiments`, { signal });
      const data = await readApiPayload(response);
      if (!response.ok) throw new Error(payloadError(data, "Could not load experiment history."));
      setExperiments(experimentArray(data.experiments));
      setError("");
    } catch (loadError) {
      if (loadError instanceof Error && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Could not load experiment history.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/products/${productId}/optimize/experiments`, { signal: controller.signal })
      .then(async (response) => {
        const data = await readApiPayload(response);
        if (!response.ok) throw new Error(payloadError(data, "Could not load experiment history."));
        setExperiments(experimentArray(data.experiments));
        setError("");
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof Error && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Could not load experiment history.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [productId]);

  const baseline = fieldValue(listing, field);
  const fieldConfig = GOOGLE_PLAY_EXPERIMENT_FIELDS[field];
  const verifiedBaseline = listing.fetchSource === "google-play-api" && Boolean(baseline.trim());

  function selectField(nextField: GooglePlayExperimentField) {
    setField(nextField);
    setVariant(nextField === "shortDescription" ? shortDescriptionDraft : fullDescriptionDraft);
  }

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/products/${productId}/optimize/experiments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ field, hypothesis, variant }),
      });
      const data = await readApiPayload(response);
      const created = isExperiment(data.experiment) ? data.experiment : null;
      if (!response.ok) throw new Error(payloadError(data, "Could not save the experiment plan."));
      if (!created) throw new Error("The saved experiment response was incomplete. Refresh the history to check its status.");
      setExperiments((current) => [created, ...current]);
      setNotice("Experiment plan saved. Create and run the test in Play Console when you are ready.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the experiment plan.");
    } finally {
      setSaving(false);
    }
  }

  async function updateExperiment(experimentId: number, payload: Record<string, unknown>) {
    setBusyExperimentId(experimentId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/products/${productId}/optimize/experiments/${experimentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readApiPayload(response);
      const updated = isExperiment(data.experiment) ? data.experiment : null;
      if (!response.ok) throw new Error(payloadError(data, "Could not update the experiment."));
      if (!updated) throw new Error("The experiment update response was incomplete. Refresh the history to check its status.");
      setExperiments((current) => current.map((item) => item.id === experimentId ? updated : item));
      setOutcomeExperimentId(null);
      setOutcomeNotes("");
      setNotice(payload.action === "record-result" && payload.outcome === "more_data_needed"
        ? "Saved. Keep the experiment running and record the final Play Console result when it is ready."
        : "Experiment updated.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update the experiment.");
    } finally {
      setBusyExperimentId(null);
    }
  }

  return (
    <section className="optimize-card play-experiment-panel" aria-labelledby="play-experiment-heading">
      <div className="play-experiment-header">
        <div>
          <p className="eyebrow">Measure the next improvement</p>
          <h2 id="play-experiment-heading">Google Play listing experiments</h2>
          <p>Turn a copy recommendation into a hypothesis, run it in Play Console, then save the outcome here.</p>
        </div>
        <span className="product-count">{experiments.filter((item) => item.status === "running").length} running</span>
      </div>

      <div className="play-experiment-guidance">
        <strong>Sorted plans and records the test; Play Console runs it.</strong>
        <span>Use one description at a time for {listing.language || "the selected listing locale"}. Measure the outcome reported by Play Console using unique user install clicks; Sorted does not estimate significance or declare a winner.</span>
        <a href={PLAY_EXPERIMENTS_GUIDE} target="_blank" rel="noreferrer">Google Play experiment setup and results ↗</a>
      </div>

      {!verifiedBaseline && (
        <p className="play-experiment-source-warning" role="status">
          Sync a description from the connected Google Play account before creating a plan. Public-page previews are not accepted as experiment baselines.
        </p>
      )}

      <form className="play-experiment-form" onSubmit={createPlan}>
        <label>Listing field to test
          <select value={field} onChange={(event) => selectField(event.target.value as GooglePlayExperimentField)}>
            <option value="shortDescription">Short description · max 80 characters</option>
            <option value="fullDescription">Full description · max 4,000 characters</option>
          </select>
        </label>
        <label>Hypothesis
          <span className="field-help">State what the variant changes and why it might help. Treat that as a test, not a predicted result.</span>
          <textarea value={hypothesis} onChange={(event) => setHypothesis(event.target.value)} maxLength={500} rows={2} />
        </label>
        <div className="play-experiment-versions">
          <label>Control · current authenticated listing
            <textarea value={baseline} readOnly rows={3} placeholder="Sync the authenticated Google Play listing first." />
            <small>{fieldCharacterCount(baseline).toLocaleString()} characters · synced {formatDate(listing.fetchedAt)}</small>
          </label>
          <label>Variant · proposed copy
            <textarea value={variant} onChange={(event) => setVariant(event.target.value)} maxLength={fieldConfig.maxLength} rows={3} placeholder="Start from the editable recommendation below, then review it." />
            <small>{fieldCharacterCount(variant).toLocaleString()} / {fieldConfig.maxLength.toLocaleString()} characters</small>
          </label>
        </div>
        <div className="play-experiment-actions">
          <button className="secondary-button" type="button" onClick={() => setVariant(field === "shortDescription" ? shortDescriptionDraft : fullDescriptionDraft)} disabled={saving}>Use current Optimize draft</button>
          <button className="primary-button" type="submit" disabled={saving || !verifiedBaseline || !hypothesis.trim() || !variant.trim() || fieldCharacterCount(variant) > fieldConfig.maxLength}>
            {saving ? "Saving plan…" : "Save experiment plan"}
          </button>
        </div>
      </form>

      {(error || notice) && <p className={error ? "play-experiment-error" : "play-experiment-notice"} role={error ? "alert" : "status"}>{error || notice}</p>}

      <div className="play-experiment-history">
        <div className="play-experiment-history-heading"><h3>Experiment history</h3><button className="text-button" type="button" onClick={() => { setLoading(true); void loadExperiments(); }} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></div>
        {loading && experiments.length === 0 ? <p className="empty-optimization">Loading saved experiments…</p> : experiments.length === 0 ? <p className="empty-optimization">No experiments yet. Start with one description change for the verified listing above.</p> : experiments.map((experiment) => (
          <article className={`play-experiment-record ${experiment.status}`} key={experiment.id}>
            <div className="play-experiment-record-heading">
              <div><strong>{GOOGLE_PLAY_EXPERIMENT_FIELDS[experiment.field].label} · {experiment.locale}</strong><small>{experiment.hypothesis}</small></div>
              <span className={`play-experiment-status ${experiment.status}`}>{statusLabel(experiment.status)}</span>
            </div>
            <p className="play-experiment-metric">Primary metric: Unique user install clicks · baseline synced {formatDate(experiment.baselineFetchedAt)}</p>
            {experiment.outcome && <p className="play-experiment-outcome"><strong>Play Console result:</strong> {GOOGLE_PLAY_EXPERIMENT_OUTCOME_LABELS[experiment.outcome]}</p>}
            {experiment.outcomeNotes && <p className="play-experiment-notes">{experiment.outcomeNotes}</p>}
            <details className="play-experiment-details">
              <summary>Compare control and variant</summary>
              <div><strong>Control</strong><p>{experiment.baselineText}</p></div>
              <div><strong>Variant</strong><p>{experiment.variantText}</p></div>
            </details>
            {experiment.status === "planned" && <div className="play-experiment-actions">
              <a href={PLAY_EXPERIMENTS_GUIDE} target="_blank" rel="noreferrer">Set this up in Play Console ↗</a>
              <button className="primary-button" type="button" onClick={() => void updateExperiment(experiment.id, { action: "start" })} disabled={busyExperimentId === experiment.id}>{busyExperimentId === experiment.id ? "Updating…" : "Mark as running"}</button>
              <button className="text-button" type="button" onClick={() => void updateExperiment(experiment.id, { action: "cancel" })} disabled={busyExperimentId === experiment.id}>Cancel plan</button>
            </div>}
            {experiment.status === "running" && <div className="play-experiment-running-actions">
              {outcomeExperimentId === experiment.id ? <form onSubmit={(event) => { event.preventDefault(); void updateExperiment(experiment.id, { action: "record-result", outcome, notes: outcomeNotes }); }}>
                <label>Result shown by Play Console
                  <select value={outcome} onChange={(event) => setOutcome(event.target.value as GooglePlayExperimentOutcome)}>
                    {GOOGLE_PLAY_EXPERIMENT_OUTCOMES.map((value) => <option key={value} value={value}>{GOOGLE_PLAY_EXPERIMENT_OUTCOME_LABELS[value]}</option>)}
                  </select>
                </label>
                <label>Notes from Play Console <span className="optional">optional</span>
                  <textarea value={outcomeNotes} onChange={(event) => setOutcomeNotes(event.target.value)} maxLength={2_000} rows={2} placeholder="Record context such as the experiment period or Console's recommended action." />
                </label>
                <div className="play-experiment-actions"><button className="primary-button" type="submit" disabled={busyExperimentId === experiment.id}>{busyExperimentId === experiment.id ? "Saving…" : "Save result"}</button><button className="text-button" type="button" onClick={() => setOutcomeExperimentId(null)}>Close</button></div>
              </form> : <div className="play-experiment-actions"><button className="primary-button" type="button" onClick={() => { setOutcomeExperimentId(experiment.id); setOutcome(experiment.outcome ?? "variant_better"); setOutcomeNotes(experiment.outcomeNotes); }}>Record Play Console result</button><button className="text-button" type="button" onClick={() => void updateExperiment(experiment.id, { action: "cancel" })} disabled={busyExperimentId === experiment.id}>Cancel experiment</button></div>}
            </div>}
            {experiment.status === "completed" && <p className="play-experiment-completed">Started {formatDate(experiment.startedAt)} · completed {formatDate(experiment.completedAt)}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
