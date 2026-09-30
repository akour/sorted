"use client";

import { useState } from "react";
import {
  getYouTubeVideoId,
  inspectGooglePlayImageFile,
  validateGooglePlayAssetSet,
  validateGooglePlayImageAsset,
  type GooglePlayAssetSet,
  type GooglePlayImageAsset,
  type GooglePlayImageKind,
  type GooglePlayVideoAsset,
} from "../lib/google-play-assets";

const imageLabels: Record<GooglePlayImageKind, string> = { primary: "Primary image", square: "Square image" };

function formatBytes(bytes: number | undefined) {
  if (!bytes) return "size unavailable";
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function GooglePlayAssetsPanel({ value, onChange }: { value: GooglePlayAssetSet; onChange: (next: Partial<GooglePlayAssetSet>) => void }) {
  const [inspecting, setInspecting] = useState<GooglePlayImageKind[]>([]);
  const [inspectionErrors, setInspectionErrors] = useState<Partial<Record<GooglePlayImageKind, string>>>({});
  const assetErrors = validateGooglePlayAssetSet(value);

  async function selectImage(kind: GooglePlayImageKind, file: File | undefined) {
    if (!file) return;
    setInspectionErrors((current) => ({ ...current, [kind]: "" }));
    setInspecting((current) => [...current.filter((item) => item !== kind), kind]);
    const cleared: GooglePlayImageAsset = { playConsoleReference: "", editorialChecks: {} };
    onChange(kind === "primary" ? { primaryImage: cleared } : { squareImage: cleared });
    try {
      const inspected = await inspectGooglePlayImageFile(file);
      const next = { ...inspected, playConsoleReference: "", editorialChecks: {} };
      onChange(kind === "primary" ? { primaryImage: next } : { squareImage: next });
    } catch (error) {
      setInspectionErrors((current) => ({ ...current, [kind]: error instanceof Error ? error.message : "Could not inspect this image." }));
    } finally {
      setInspecting((current) => current.filter((item) => item !== kind));
    }
  }

  function updateImage(kind: GooglePlayImageKind, patch: Partial<GooglePlayImageAsset>) {
    const current = kind === "primary" ? value.primaryImage : value.squareImage;
    const next = { ...current, ...patch };
    onChange(kind === "primary" ? { primaryImage: next } : { squareImage: next });
  }

  function updateVideo(patch: Partial<GooglePlayVideoAsset>) {
    onChange({ video: { ...value.video, ...patch } });
  }

  function imageCard(kind: GooglePlayImageKind) {
    const image = kind === "primary" ? value.primaryImage : value.squareImage;
    const errors = validateGooglePlayImageAsset(kind, image);
    const checks = image?.editorialChecks ?? {};
    const check = (key: "uniqueToEvent" | "noAddedTextOrUi" | "safeZoneReviewed", label: string) => (
      <label className="google-play-asset-check" key={key}><input type="checkbox" checked={Boolean(checks[key])} onChange={(event) => updateImage(kind, { editorialChecks: { ...checks, [key]: event.target.checked } })} />{label}</label>
    );

    return (
      <article className="google-play-asset-card" key={kind}>
        <div className="google-play-asset-title"><div><strong>{imageLabels[kind]}</strong><small>{kind === "primary" ? "Required · JPG or 24-bit PNG · 1920 × 1080" : "Required · JPG or 24-bit PNG · 1:1 square"}</small></div><span className={errors.length ? "pending" : "ready"}>{errors.length ? "Needs review" : "Ready"}</span></div>
        <label>Choose artwork file<input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; void selectImage(kind, file); }} disabled={inspecting.includes(kind)} /></label>
        {inspecting.includes(kind) && <p className="google-play-asset-feedback">Inspecting image locally…</p>}
        {inspectionErrors[kind] && <p className="google-play-asset-feedback error" role="alert">{inspectionErrors[kind]}</p>}
        {image?.fileName && <p className="google-play-asset-meta">Inspected: {image.fileName} · {image.width} × {image.height} · {image.mimeType === "image/jpeg" ? "JPEG" : image.mimeType === "image/png" ? `PNG, ${image.pngBitDepth ?? "?"}-bit` : image.mimeType} · {formatBytes(image.sizeBytes)}</p>}
        <label>Play Console asset reference <span className="field-help">Optional until uploaded; then add its Console ID or filename.</span><input value={image?.playConsoleReference ?? ""} onChange={(event) => updateImage(kind, { playConsoleReference: event.target.value })} placeholder="Asset ID or filename after upload" /></label>
        <label>AI-generated or AI-edited <span className="field-help">Record your assessment; confirm any required declaration in Play Console.</span><select value={image?.aiGeneratedOrEdited === undefined ? "" : image.aiGeneratedOrEdited ? "yes" : "no"} onChange={(event) => updateImage(kind, { aiGeneratedOrEdited: event.target.value === "" ? undefined : event.target.value === "yes" })}><option value="">Not assessed</option><option value="yes">Yes / potentially applicable</option><option value="no">No</option></select></label>
        <div className="google-play-asset-checks" aria-label={`${imageLabels[kind]} editorial review`}>
          <span>Confirm the visual checks</span>
          {check("uniqueToEvent", "Specific to this event; not reused from the store listing or another event")}
          {check("noAddedTextOrUi", "No added event text, logo, Store badge, or button-like UI")}
          {check("safeZoneReviewed", kind === "primary" ? "Main subject checked against the primary-image safe zone and crop" : "Main subject centered and crop reviewed in Play Console preview")}
        </div>
        {kind === "primary" && (image?.sizeBytes ?? 0) > 1_000_000 && <p className="google-play-asset-note">This exceeds 1 MB, so it will not meet Google’s additional primary-image size requirement for Spotlight. It may still be used for standard promotional content.</p>}
        {errors.length > 0 && <ul className="google-play-asset-errors">{errors.map((error) => <li key={error}>{error}</li>)}</ul>}
      </article>
    );
  }

  const video = value.video ?? {};
  const videoId = getYouTubeVideoId(video.url);
  const videoChecks = video.checks ?? {};
  const videoChecklist: Array<[keyof NonNullable<GooglePlayVideoAsset["checks"]>, string]> = [
    ["publicOrUnlisted", "Public or unlisted (not private)"],
    ["embeddable", "Embedding is enabled"],
    ["monetizationOff", "Monetization/ads are turned off"],
    ["landscape", "Landscape orientation"],
    ["localized", "Localized for the target languages"],
  ];

  return (
    <section className="google-play-assets" aria-labelledby="google-play-assets-heading">
      <div className="event-card-heading"><div><p className="eyebrow">Asset readiness</p><h3 id="google-play-assets-heading">Check artwork before handoff</h3><span>Sorted inspects selected image files in your browser; it does not upload or retain the artwork. Upload to Play Console separately.</span></div></div>
      <div className="google-play-asset-grid">{imageCard("primary")}{imageCard("square")}</div>
      <p className="google-play-asset-note">The primary-image rules follow Google’s 1920 × 1080 and JPG/24-bit PNG requirements. For square art, this checks 1:1 geometry; use Play Console’s preview as the final crop/resolution check.</p>
      <article className="google-play-asset-card google-play-video-card">
        <div className="google-play-asset-title"><div><strong>Optional YouTube video</strong><small>Highly recommended for promotional content</small></div><span className={video.url?.trim() && !assetErrors.some((error) => error.includes("YouTube")) ? "ready" : "optional"}>{video.url?.trim() ? videoId ? "Reference captured" : "Check link" : "Optional"}</span></div>
        <label>YouTube video URL<input type="url" value={video.url ?? ""} onChange={(event) => updateVideo({ url: event.target.value })} placeholder="https://youtu.be/…" /></label>
        <label>Play Console asset reference <span className="field-help">Optional until uploaded; then add its Console ID or video ID.</span><input value={video.playConsoleReference ?? ""} onChange={(event) => updateVideo({ playConsoleReference: event.target.value })} placeholder="Video ID or Console reference" /></label>
        {video.url?.trim() && <div className="google-play-asset-checks"><span>Verify in YouTube/Play Console; Sorted cannot confirm these externally</span>{videoChecklist.map(([key, label]) => <label className="google-play-asset-check" key={key}><input type="checkbox" checked={Boolean(videoChecks[key])} onChange={(event) => updateVideo({ checks: { ...videoChecks, [key]: event.target.checked } })} />{label}</label>)}</div>}
      </article>
      <p className={assetErrors.length ? "google-play-setup-status" : "google-play-setup-status ready"} role="status">{assetErrors.length ? `Asset readiness needs attention: ${assetErrors.join(" ")}` : "Required image specs and editorial checks are ready for handoff review."}</p>
      <p className="google-play-asset-note">Review Google’s per-asset AI-generated-content declaration in Play Console when applicable. Sorted records image metadata and references only; no image or video is uploaded by this panel.</p>
    </section>
  );
}
