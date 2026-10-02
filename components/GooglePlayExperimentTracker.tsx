"use client";

import { useState } from "react";
import { createOptimizationExperiment, type OptimizationExperiment } from "../lib/aso-experiments";

const metricLabels = {
  "unique-install-clicks": "Unique user install clicks",
  "unique-open-clicks": "Unique user open clicks",
  "unique-pre-registration-clicks": "Unique user pre-registration clicks",
} as const;

const statusLabels = {
  planned: "Planned",
  running: "Running in Play Console",
  "variant-won": "Play Console: variant performed better",
  "current-won": "Play Console: current listing performed better",
  draw: "Play Console: draw",
  "more-data": "Play Console: more data needed",
} as const;

export function GooglePlayExperimentTracker({ opportunities, experiments, onChange, onSave, saving }: {
  opportunities: Array<{ title: string; area: string }>;
  experiments: OptimizationExperiment[];
  onChange: (next: OptimizationExperiment[]) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [selectedOpportunityIndex, setSelectedOpportunityIndex] = useState("0");

  function updateExperiment(id: string, patch: Partial<OptimizationExperiment>) {
    onChange(experiments.map((experiment) => experiment.id === id ? { ...experiment, ...patch } : experiment));
  }

  function addExperiment() {
    const opportunity = opportunities[Number(selectedOpportunityIndex)] ?? opportunities[0];
    if (!opportunity) return;
    const experiment = createOptimizationExperiment(opportunity.title, opportunity.area);
    onChange([...experiments, experiment]);
    setExpandedIds((current) => [...current, experiment.id]);
  }

  function removeExperiment(id: string) {
    if (!window.confirm("Remove this experiment plan and its saved notes? This cannot be undone.")) return;
    onChange(experiments.filter((experiment) => experiment.id !== id));
    setExpandedIds((current) => current.filter((item) => item !== id));
  }

  return <div className="optimize-card google-play-experiments">
    <div className="optimize-card-heading">
      <div><p className="eyebrow">Learning loop</p><h3>Google Play experiments</h3></div>
      <span>{experiments.length} tracked</span>
    </div>
    <p className="experiment-disclaimer">Sorted keeps your hypotheses and notes here. Create and run the experiment in Play Console, then record its result here—nothing is submitted automatically.</p>
    {opportunities.length ? <div className="experiment-create-row"><label>Recommendation to test<select value={selectedOpportunityIndex} onChange={(event) => setSelectedOpportunityIndex(event.target.value)}>{opportunities.map((opportunity, index) => <option key={`${opportunity.title}-${index}`} value={index}>{opportunity.title}</option>)}</select></label><button type="button" className="secondary-button" onClick={addExperiment}>Plan a Play Store test</button></div> : <p className="experiment-empty">Generate optimization recommendations first, then you can plan a Play Store test for one.</p>}
    {experiments.length ? <div className="experiment-list">{experiments.map((experiment) => <details className="experiment-entry" key={experiment.id} open={expandedIds.includes(experiment.id)} onToggle={(event) => setExpandedIds((current) => event.currentTarget.open ? current.includes(experiment.id) ? current : [...current, experiment.id] : current.filter((id) => id !== experiment.id))}>
      <summary><span><strong>{experiment.opportunityTitle}</strong><small>{experiment.opportunityArea} · {statusLabels[experiment.status]}</small></span></summary>
      <div className="experiment-fields">
        <label>Hypothesis<textarea value={experiment.hypothesis} onChange={(event) => updateExperiment(experiment.id, { hypothesis: event.target.value })} placeholder="If we change this one thing, we expect…" rows={2} /></label>
        <div className="experiment-field-grid">
          <label>Primary metric<select value={experiment.metric} onChange={(event) => updateExperiment(experiment.id, { metric: event.target.value as OptimizationExperiment["metric"] })}>{Object.entries(metricLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Language / locale<input value={experiment.locale} onChange={(event) => updateExperiment(experiment.id, { locale: event.target.value })} placeholder="Default listing language or e.g. fr-FR" /></label>
        </div>
        <label>Play Console status<select value={experiment.status} onChange={(event) => updateExperiment(experiment.id, { status: event.target.value as OptimizationExperiment["status"] })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Start date<input type="date" value={experiment.startDate} onChange={(event) => updateExperiment(experiment.id, { startDate: event.target.value })} /></label>
        <div className="experiment-field-grid">
          <label>Control / current asset<textarea value={experiment.control} onChange={(event) => updateExperiment(experiment.id, { control: event.target.value })} placeholder="What users see today" rows={3} /></label>
          <label>Variant / one change<textarea value={experiment.variant} onChange={(event) => updateExperiment(experiment.id, { variant: event.target.value })} placeholder="The single asset or text change being tested" rows={3} /></label>
        </div>
        <label>Result notes from Play Console<textarea value={experiment.resultNote} onChange={(event) => updateExperiment(experiment.id, { resultNote: event.target.value })} placeholder="Record the result, useful context, or why you kept the current listing." rows={2} /></label>
        <p className="experiment-guidance">Google Play recommends changing one asset at a time. Use one primary metric; CTR and peer comparisons can be reviewed separately in Play Console reports.</p>
        <button type="button" className="experiment-remove-button" onClick={() => removeExperiment(experiment.id)}>Remove this experiment</button>
      </div>
    </details>)}</div> : null}
    <div className="experiment-save-row"><span>Saved experiments stay separate from AI-generated recommendations.</span><button type="button" className="primary-button" disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save experiment plan"}</button></div>
  </div>;
}
