"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ListingWorkspace } from "../../components/ListingWorkspace";
import { useWorkspaceLocation } from "../../hooks/useWorkspaceLocation";

import { GooglePlayPerformanceImporter } from "../../components/GooglePlayPerformanceImporter";
import { PromoCalendarGrid } from "../../components/PromoCalendarGrid";
import { promoReviewErrors, selectedPromoCopy } from "../../lib/promo-review";
import { OPENCODE_MODELS } from "../../lib/opencode-models";
import { canMarkPublishReady } from "../../lib/publish-readiness";

import { getInitialProductIconUrl } from "../../lib/product-icon-url";
import { classifyProductUrl, normalizeProductUrlInput } from "../../lib/product-url";
import type { LocalizedStoreListing } from "../../lib/google-play-localizations";
import type { OptimizationExperiment } from "../../lib/aso-experiments";

type Product = {
  id: number;
  name: string;
  type: string;
  url: string;
  iconUrl: string;
  position: string;
  audience: string;
  updatedAt: string;
  hasCurrentListing?: boolean;
};

type ResearchBrief = {
  productId: number;
  intent: string;
  semanticCore: string;
  competitors: string;
  proof: string;
  notes: string;
  updatedAt?: string;
};

type OptimizationOpportunity = { title: string; area: string; impact: string; effort: string; rationale: string; status: "open" | "done" };
type OptimizationAction = { title: string; area: string; status: "open" | "done" };
type CurrentListing = { platform?: string; title?: string; subtitle?: string; shortDescription?: string; longDescription?: string; sourceUrl?: string; fetchedAt?: string; category?: string; developer?: string; iconUrl?: string; bundleId?: string; storeId?: string };
type ProductLinkPreview = { url: string; sourceType: "website" | "google-play" | "app-store"; sourceLabel: string; name: string; productType: string; iconUrl: string; available: boolean; message?: string; currentListing?: CurrentListing };
type GooglePlayConnection = { id: number; provider: "google-play"; packageName: string; locale: string; label: string; credentialHint: string; status: "connected" | "testing" | "error"; lastTestedAt?: string | null; lastSyncedAt?: string | null; lastError?: string | null; createdAt?: string; updatedAt?: string };
type GooglePlayOAuthConnection = { id: number; provider: "google-play"; packageName: string; locale: string; label: string; accountEmail: string; refreshTokenHint: string; status: "connected" | "error"; lastSyncedAt?: string | null; lastError?: string | null; createdAt?: string; updatedAt?: string };
type OptimizationPlan = { productId: number; focus: string; storeTitle: string; storeSubtitle: string; storeShortDescription: string; storeLongDescription: string; answerSummary: string; currentListing: CurrentListing; localizedListings: LocalizedStoreListing[]; opportunities: OptimizationOpportunity[]; experiments: OptimizationExperiment[]; nextActions: OptimizationAction[]; updatedAt?: string };
type CreateVariant = { label: string; platform: string; title: string; subtitle: string; description: string; status: "draft" | "needs-edit" | "approved" };
type AnswerBlock = { question: string; answer: string; status: "draft" | "needs-edit" | "approved" };
type PromoBrief = { theme: string; hook: string; body: string; cta: string; channels: string[] };
type CreativeBrief = { concept: string; visualDirection: string; frames: string[]; proofToShow: string[] };
type CreateBrief = { productId: number; status: "draft" | "review" | "approved"; primaryMessage: string; storeVariants: CreateVariant[]; answerBlocks: AnswerBlock[]; promoBrief: PromoBrief; creativeBrief: CreativeBrief; updatedAt?: string };
type PublishChannel = { name: string; status: "draft" | "ready" | "published"; note: string; lastExportedAt: string };
type PublishChecklistItem = { label: string; area: string; done: boolean };
type PublishPlan = { productId: number; status: "draft" | "review" | "ready" | "published"; channels: PublishChannel[]; checklist: PublishChecklistItem[]; releaseNotes: string; updatedAt?: string };
type PublishReadiness = { research: boolean; optimize: boolean; create: boolean };
type PromoOption = { tagline: string; description: string };
type PromoLocale = { locale: string; tagline: string; description: string; status: string; sourceTagline?: string; sourceDescription?: string };
type PromoChannel = "googlePlay" | "appleEvent" | "siteEntry" | "localization" | "creative";
type PromoStageKey = "plan" | "google" | "localization" | "apple" | "site" | "creative" | "review";
type PromoEvent = { id?: number; productId: number; productName?: string; title: string; eventType: string; status: string; startDate: string; endDate: string; theme: string; objective: string; eventBrief: Record<string, string>; googlePlay: { options?: PromoOption[]; selectedOption?: number; tagline?: string; description?: string }; appleEvent: { name?: string; subtitle?: string; description?: string }; siteEntry: { headline?: string; slug?: string; excerpt?: string; body?: string; keywords?: string[] | string; cta?: string }; localization: PromoLocale[]; creative: { concept?: string; prompt?: string; dimensions?: string; safeAreas?: string; proofToShow?: string[] | string }; updatedAt?: string };
type WorkflowStageStatus = "not-started" | "draft" | "needs-review" | "ready";
type WorkflowStage = { key: string; label: string; view: string; status: WorkflowStageStatus; detail: string };
type WorkspaceNextAction = { title: string; buttonLabel: string; view: string; detail: string };
type ReportProduct = Product & { foundationReady: boolean; publishStatus: string; eventCount: number; workflow: WorkflowStage[]; workflowStartedCount: number; nextAction: WorkspaceNextAction };
type ReportsData = { summary: { products: number; foundationReady: number; completeWorkspaces: number; readyForHandoff: number; promoEvents: number }; products: ReportProduct[] };
type ValidationCheck = { label: string; detail: string; valid: boolean };

type NavigationItem = { label: string; icon: string; view: string };

const workspaceNavItems: NavigationItem[] = [
  { label: "Overview", icon: "⌂", view: "Overview" },
  { label: "Products", icon: "◇", view: "Products" },
  { label: "Calendar", icon: "□", view: "Calendar" },
  { label: "Reports", icon: "◒", view: "Reports" },
];

const productNavItems: NavigationItem[] = [
  { label: "Overview", icon: "⌂", view: "Product workspace" },
  { label: "Store listing", icon: "↗", view: "Optimize" },
  { label: "Promotions", icon: "□", view: "Calendar" },
  { label: "Results", icon: "◒", view: "Results" },
  { label: "Product settings", icon: "⚙", view: "Settings" },
];
const secondaryProductItems: NavigationItem[] = [
  { label: "Store connection", icon: "◎", view: "Connections" },
  { label: "Product brief", icon: "⌕", view: "Research" },
  { label: "Saved creative briefs", icon: "✦", view: "Create" },
  { label: "Legacy export checklist", icon: "⇧", view: "Publish" },
];

const promoStages: Array<{ id: PromoStageKey; label: string }> = [
  { id: "plan", label: "Details" },
  { id: "google", label: "Google Play" },
  { id: "localization", label: "Translations" },
  { id: "creative", label: "Assets" },
  { id: "review", label: "Review & handoff" },
];

const blankProduct = { name: "", type: "Mobile app", url: "", position: "", audience: "" };
const blankResearch: ResearchBrief = { productId: 0, intent: "", semanticCore: "", competitors: "", proof: "", notes: "" };
const blankOptimization: OptimizationPlan = { productId: 0, focus: "ASO + AEO", storeTitle: "", storeSubtitle: "", storeShortDescription: "", storeLongDescription: "", answerSummary: "", currentListing: {}, localizedListings: [], opportunities: [], experiments: [], nextActions: [] };
const blankCreate: CreateBrief = { productId: 0, status: "draft", primaryMessage: "", storeVariants: [], answerBlocks: [], promoBrief: { theme: "", hook: "", body: "", cta: "", channels: [] }, creativeBrief: { concept: "", visualDirection: "", frames: [], proofToShow: [] } };
const blankPublish: PublishPlan = { productId: 0, status: "draft", channels: [{ name: "Google Play", status: "draft", note: "", lastExportedAt: "" }, { name: "App Store", status: "draft", note: "", lastExportedAt: "" }, { name: "Website / AEO", status: "draft", note: "", lastExportedAt: "" }], checklist: [{ label: "Review the research foundation", area: "Research", done: false }, { label: "Confirm store copy and character limits", area: "Optimize", done: false }, { label: "Approve copy, answers, and creative direction", area: "Create", done: false }, { label: "Export the channel packet", area: "Publish", done: false }], releaseNotes: "" };
const blankPromoEvent: PromoEvent = { productId: 0, title: "", eventType: "feature", status: "planned", startDate: "", endDate: "", theme: "", objective: "", eventBrief: { idea: "", whatNew: "", userValue: "", participation: "", requirements: "", rewards: "", content: "", missions: "", bonuses: "", notes: "" }, googlePlay: { options: [{ tagline: "", description: "" }, { tagline: "", description: "" }, { tagline: "", description: "" }], selectedOption: 0, tagline: "", description: "" }, appleEvent: { name: "", subtitle: "", description: "" }, siteEntry: { headline: "", slug: "", excerpt: "", body: "", keywords: [], cta: "" }, localization: [{ locale: "en", tagline: "", description: "", status: "draft" }, { locale: "ar", tagline: "", description: "", status: "draft" }], creative: { concept: "", prompt: "", dimensions: "", safeAreas: "", proofToShow: [] } };

function createBlankPromoEvent(productId: number): PromoEvent {
  return { ...blankPromoEvent, productId, eventBrief: { ...blankPromoEvent.eventBrief }, googlePlay: { ...blankPromoEvent.googlePlay, options: blankPromoEvent.googlePlay.options?.map((item) => ({ ...item })) }, appleEvent: { ...blankPromoEvent.appleEvent }, siteEntry: { ...blankPromoEvent.siteEntry, keywords: [] }, localization: blankPromoEvent.localization.map((item) => ({ ...item })), creative: { ...blankPromoEvent.creative, proofToShow: [] } };
}
const blankReports: ReportsData = { summary: { products: 0, foundationReady: 0, completeWorkspaces: 0, readyForHandoff: 0, promoEvents: 0 }, products: [] };
const workflowStatusLabels: Record<WorkflowStageStatus, string> = { "not-started": "Not started", draft: "Draft", "needs-review": "Needs review", ready: "Ready" };
function hasCropSafeAreaGuidance(value: string) {
  const normalized = value.toLowerCase();
  return normalized.includes("inside safe zones") && normalized.includes("away from crop zones");
}

function formatDate(value: string | undefined) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function openCodeModelName(modelId: unknown) {
  if (typeof modelId !== "string" || !modelId) return "the configured model";
  return OPENCODE_MODELS.find((model) => model.id === modelId)?.name ?? modelId;
}

function completedModelLabel(modelId: unknown, fallbacksUsed: unknown = 0) {
  const count = typeof fallbacksUsed === "number" && Number.isFinite(fallbacksUsed) ? fallbacksUsed : 0;
  return count > 0 ? `${openCodeModelName(modelId)} (fallback ${count})` : openCodeModelName(modelId);
}

function generationErrorMessage(data: { error?: unknown; detail?: unknown }, fallback: string) {
  const message = typeof data.error === "string" ? data.error : fallback;
  const detail = typeof data.detail === "string" ? data.detail : "";
  return detail ? `${message} Details: ${detail}` : message;
}

function ValidationSummary({ checks, title = "Validation" }: { checks: ValidationCheck[]; title?: string }) {
  const failed = checks.filter((check) => !check.valid);
  return <div className={`validation-summary ${failed.length ? "has-errors" : "is-ready"}`}><div className="validation-heading"><div><p className="eyebrow">{title}</p><strong>{failed.length ? `${failed.length} item${failed.length === 1 ? "" : "s"} need attention` : "Checks passed"}</strong></div><span>{checks.length - failed.length}/{checks.length} checks passed</span></div><div className="validation-list">{checks.map((check) => <div className={`validation-check ${check.valid ? "valid" : "invalid"}`} key={check.label}><span>{check.valid ? "✓" : "!"}</span><div><strong>{check.label}</strong><small>{check.detail}</small></div></div>)}</div></div>;
}

function CharacterCounter({ id, value, limit }: { id: string; value: string; limit: number }) {
  const overLimit = value.length > limit;
  return <span id={id} className={`char-count ${overLimit ? "over" : ""}`}>{value.length}/{limit}</span>;
}

function AiActionButton({ label, generating, onClick, disabled = false, describedBy, title }: { label: string; generating: boolean; onClick: () => void; disabled?: boolean; describedBy?: string; title?: string }) {
  return <button className="primary-button ai-action-button" type="button" onClick={onClick} disabled={disabled || generating} aria-busy={generating} aria-describedby={describedBy} title={title}>
    <span className="ai-action-icon" aria-hidden="true">✦</span>
    <span>{generating ? "Generating…" : label}</span>
  </button>;
}

function promoEventStageDrafts(event: PromoEvent): Record<PromoStageKey, boolean> {
  const hasText = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  const googleOptions = Array.isArray(event.googlePlay?.options) ? event.googlePlay.options : [];
  const locales = Array.isArray(event.localization) ? event.localization : [];
  const siteEntry = event.siteEntry ?? {};
  const creative = event.creative ?? {};
  return {
    review: promoReviewErrors(event).length === 0,
    plan: Object.values(event.eventBrief ?? {}).some(hasText),
    google: googleOptions.some((option) => option && (hasText(option.tagline) || hasText(option.description))),
    localization: locales.some((locale) => locale && (hasText(locale.tagline) || hasText(locale.description))),
    apple: [event.appleEvent?.name, event.appleEvent?.subtitle, event.appleEvent?.description].some(hasText),
    site: Object.values(siteEntry).some((value) => hasText(value) || (Array.isArray(value) && value.some(hasText))),
    creative: Object.values(creative).some((value) => hasText(value) || (Array.isArray(value) && value.some(hasText))),
  };
}

export default function Home() {
  const [view, setView] = useState("Overview");
  const [focusExperimentsOnOpen, setFocusExperimentsOnOpen] = useState(false);
  const [experimentOpportunityOnOpen, setExperimentOpportunityOnOpen] = useState<string | undefined>();
  const [products, setProducts] = useState<Product[]>([]);
  const iconLookupAttempts = useRef(new Set<string>());
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(blankProduct);
  const [modalOpen, setModalOpen] = useState(false);
  const [productPreview, setProductPreview] = useState<ProductLinkPreview | null>(null);
  const [productPreviewLoading, setProductPreviewLoading] = useState(false);
  const [productPreviewError, setProductPreviewError] = useState("");
  const productNameEdited = useRef(false);
  const productTypeEdited = useRef(false);
  const suggestedProductName = useRef("");
  const suggestedProductType = useRef("");
  const productPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productPreviewController = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [research, setResearch] = useState<ResearchBrief>(blankResearch);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchSaving, setResearchSaving] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [connection, setConnection] = useState<GooglePlayConnection | null>(null);
  const [oauthConnection, setOauthConnection] = useState<GooglePlayOAuthConnection | null>(null);
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [connectionSyncing, setConnectionSyncing] = useState(false);
  const [optimization, setOptimization] = useState<OptimizationPlan>(blankOptimization);
  const [optimizationLoading, setOptimizationLoading] = useState(false);
  const [optimizationSaving, setOptimizationSaving] = useState(false);
  const [optimizationGenerating, setOptimizationGenerating] = useState(false);
  const [createBrief, setCreateBrief] = useState<CreateBrief>(blankCreate);
  const [createLoading, setCreateLoading] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createGenerating, setCreateGenerating] = useState(false);
  const [publish, setPublish] = useState<PublishPlan>(blankPublish);
  const [publishReadiness, setPublishReadiness] = useState<PublishReadiness>({ research: false, optimize: false, create: false });
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishSaving, setPublishSaving] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<PromoEvent[]>([]);
  const [calendarEventsLoaded, setCalendarEventsLoaded] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [calendarGenerating, setCalendarGenerating] = useState(false);
  const [eventDraft, setEventDraft] = useState<PromoEvent>(blankPromoEvent);
  const [calendarDraftMode, setCalendarDraftMode] = useState<"auto" | "new" | "saved">("auto");
  const [reports, setReports] = useState<ReportsData>(blankReports);
  const [reportsLoading, setReportsLoading] = useState(true);

  useWorkspaceLocation(products, loading, activeProduct, view, setActiveProduct, setView);
  const optimizationRequest = useRef(0);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/products", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load products.");
      setProducts(data.products ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load products.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProductIcon = useCallback(async (productId: number) => {
    try {
      const response = await fetch("/api/products/" + productId + "/icon", { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.product) return;
      const updatedProduct = data.product as Product;
      setProducts((current) => current.map((product) => product.id === productId ? {
        ...product,
        ...updatedProduct,
        hasCurrentListing: data.metadataStatus === "ready" || product.hasCurrentListing,
      } : product));
      setActiveProduct((current) => current?.id === productId ? {
        ...current,
        ...updatedProduct,
        hasCurrentListing: data.metadataStatus === "ready" || current.hasCurrentListing,
      } : current);
    } catch {
      // Icon lookup is best-effort; the product remains available with its initials.
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadProducts(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProducts]);

  useEffect(() => () => {
    if (productPreviewTimer.current) window.clearTimeout(productPreviewTimer.current);
    productPreviewController.current?.abort();
  }, []);

  useEffect(() => {
    for (const product of products) {
      const url = product.url.trim();
      if (!url) continue;
      const kind = classifyProductUrl(url);
      const storeListingMissing = (kind === "google-play" || kind === "app-store") && !product.hasCurrentListing;
      if (product.iconUrl?.trim() && !storeListingMissing) continue;

      const attemptKey = `${product.id}:${url}`;
      if (iconLookupAttempts.current.has(attemptKey)) continue;
      iconLookupAttempts.current.add(attemptKey);
      void fetchProductIcon(product.id);
    }
  }, [products, fetchProductIcon]);

  const loadResearch = useCallback(async (productId: number) => {
    setResearchLoading(true);
    try {
      const response = await fetch(`/api/products/${productId}/research`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load the research brief.");
      setResearch(data.research ?? { ...blankResearch, productId });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the research brief.");
    } finally {
      setResearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeProduct || view !== "Research") return;
    const timer = window.setTimeout(() => { void loadResearch(activeProduct.id); }, 0);
    return () => window.clearTimeout(timer);
  }, [activeProduct, loadResearch, view]);

  const loadConnection = useCallback(async (productId: number) => {
    setConnectionLoading(true);
    try {
      const response = await fetch(`/api/products/${productId}/connections`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load the product connections.");
      setConnection(data.connection ?? null);
      setOauthConnection(data.oauthConnection ?? null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the product connections.");
    } finally {
      setConnectionLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeProduct || view !== "Connections") return;
    const timer = window.setTimeout(() => { void loadConnection(activeProduct.id); }, 0);
    return () => window.clearTimeout(timer);
  }, [activeProduct, loadConnection, view]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("googlePlay");
    const productId = Number(params.get("productId"));
    if (!result || !Number.isSafeInteger(productId) || productId < 1 || !products.length) return;
    const product = products.find((candidate) => candidate.id === productId);
    if (!product) return;
    const timer = window.setTimeout(() => {
      setActiveProduct(product);
      setView("Connections");
      setNotice(result === "connected" ? "Google Play account connected to this product." : result === "cancelled" ? "Google Play authorization was cancelled." : "Google Play authorization could not be completed.");
      window.setTimeout(() => setNotice(""), 5200);
      window.history.replaceState({}, "", window.location.pathname);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [products]);

  const loadOptimization = useCallback(async (productId: number) => {
    const requestId = ++optimizationRequest.current;
    setOptimizationLoading(true);
    try {
      const response = await fetch(`/api/products/${productId}/optimize`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load the optimization plan.");
      if (requestId !== optimizationRequest.current) return;
      const draft = data.optimization ?? { ...blankOptimization, productId };
      setOptimization({ ...draft, storeTitle: draft.storeTitle || draft.currentListing?.title || "", storeShortDescription: draft.storeShortDescription || draft.currentListing?.shortDescription || "", storeLongDescription: draft.storeLongDescription || draft.currentListing?.longDescription || "" });
      setError("");
    } catch (err) {
      if (requestId === optimizationRequest.current) setError(err instanceof Error ? err.message : "Could not load the listing draft.");
    } finally {
      if (requestId === optimizationRequest.current) setOptimizationLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeProduct || view !== "Optimize") return;
    const timer = window.setTimeout(() => { void loadOptimization(activeProduct.id); }, 0);
    return () => window.clearTimeout(timer);
  }, [activeProduct, loadOptimization, view]);

  const loadCreate = useCallback(async (productId: number) => {
    setCreateLoading(true);
    try {
      const response = await fetch(`/api/products/${productId}/create`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load the creation brief.");
      setCreateBrief(data.create ?? { ...blankCreate, productId });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the creation brief.");
    } finally {
      setCreateLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeProduct || view !== "Create") return;
    const timer = window.setTimeout(() => { void loadCreate(activeProduct.id); }, 0);
    return () => window.clearTimeout(timer);
  }, [activeProduct, loadCreate, view]);

  const loadPublish = useCallback(async (productId: number) => {
    setPublishLoading(true);
    try {
      const response = await fetch(`/api/products/${productId}/publish`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load the publishing workspace.");
      setPublish(data.publish ?? { ...blankPublish, productId });
      setPublishReadiness(data.readiness ?? { research: false, optimize: false, create: false });
      setError("");
    } catch (err) {
      setPublish({ ...blankPublish, productId });
      setPublishReadiness({ research: false, optimize: false, create: false });
      setError(err instanceof Error ? err.message : "Could not load the publishing workspace.");
    } finally {
      setPublishLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeProduct || view !== "Publish") return;
    const timer = window.setTimeout(() => { void loadPublish(activeProduct.id); }, 0);
    return () => window.clearTimeout(timer);
  }, [activeProduct, loadPublish, view]);

  const loadCalendar = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const response = await fetch("/api/calendar", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load the promo calendar.");
      setCalendarEvents(data.events ?? []);
      setCalendarEventsLoaded(true);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the promo calendar.");
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view !== "Calendar") return;
    const timer = window.setTimeout(() => { void loadCalendar(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCalendar, view]);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const response = await fetch("/api/reports", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load the workspace report.");
      setReports({ summary: data.summary ?? blankReports.summary, products: data.products ?? [] });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the workspace report.");
    } finally {
      setReportsLoading(false);
    }
  }, []);

  useEffect(() => {
    const shouldLoad = activeProduct ? view === "Product workspace" : view === "Overview" || view === "Reports";
    if (!shouldLoad) return;
    const timer = window.setTimeout(() => { void loadReports(); }, 0);
    return () => window.clearTimeout(timer);
  }, [activeProduct, loadReports, products, view]);

  const calendarProducts = activeProduct ? [activeProduct] : products;
  const visibleCalendarEvents = activeProduct
    ? calendarEvents.filter((event) => event.productId === activeProduct.id)
    : calendarEvents;
  const productSavedEvent = activeProduct ? calendarEvents.find((event) => event.productId === activeProduct.id) : undefined;
  const savedDraftIsAvailable = Boolean(activeProduct && eventDraft.id && calendarEvents.some((event) => event.id === eventDraft.id && event.productId === activeProduct.id));
  const keepProductDraft = Boolean(activeProduct && eventDraft.productId === activeProduct.id && (
    calendarDraftMode === "new"
    || (calendarDraftMode === "saved" && (!calendarEventsLoaded || savedDraftIsAvailable))
  ));
  const calendarDraftMatchesScope = !activeProduct || eventDraft.productId === activeProduct.id;
  const visibleCalendarDraft = view === "Calendar"
    ? activeProduct && !calendarDraftMatchesScope ? createBlankPromoEvent(activeProduct.id) : eventDraft
    : activeProduct ? keepProductDraft ? eventDraft : productSavedEvent ?? createBlankPromoEvent(activeProduct.id) : eventDraft;
  const visibleCalendarEditorOpen = calendarDraftMode !== "auto" && calendarDraftMatchesScope;
  const greeting = useMemo(() => {
    if (activeProduct) return activeProduct.name;
    if (view === "Products") return "Your product portfolio";
    if (view === "Reports") return "Workspace report";
    return "Good morning, marketer";
  }, [activeProduct, view]);

  function cancelProductPreview() {
    if (productPreviewTimer.current) window.clearTimeout(productPreviewTimer.current);
    productPreviewTimer.current = null;
    productPreviewController.current?.abort();
    productPreviewController.current = null;
  }

  function resetAutomaticProductFields() {
    if (!suggestedProductName.current && !suggestedProductType.current) return;
    const previousName = suggestedProductName.current;
    const previousType = suggestedProductType.current;
    setForm((current) => ({
      ...current,
      name: !productNameEdited.current && current.name === previousName ? "" : current.name,
      type: !productTypeEdited.current && current.type === previousType ? "Mobile app" : current.type,
    }));
    suggestedProductName.current = "";
    suggestedProductType.current = "";
  }

  function scheduleProductPreview(value: string) {
    cancelProductPreview();
    resetAutomaticProductFields();
    setProductPreview(null);
    setProductPreviewError("");
    const normalizedUrl = normalizeProductUrlInput(value);
    setProductPreviewLoading(Boolean(normalizedUrl));
    if (!normalizedUrl) return;

    const controller = new AbortController();
    productPreviewController.current = controller;
    productPreviewTimer.current = window.setTimeout(async () => {
      productPreviewTimer.current = null;
      setProductPreviewLoading(true);
      try {
        const response = await fetch("/api/products/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: normalizedUrl }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok || !data.preview) throw new Error(data.error ?? "We could not read that product link.");
        const preview = data.preview as ProductLinkPreview;
        setProductPreview(preview);
        if (!productNameEdited.current && preview.name) {
          suggestedProductName.current = preview.name;
          setForm((current) => ({ ...current, name: preview.name }));
        }
        if (!productTypeEdited.current && preview.productType) {
          suggestedProductType.current = preview.productType;
          setForm((current) => ({ ...current, type: preview.productType }));
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setProductPreviewError(err instanceof Error ? err.message : "We could not read that product link.");
      } finally {
        if (productPreviewController.current === controller) {
          productPreviewController.current = null;
          setProductPreviewLoading(false);
        }
      }
    }, 500);
  }

  function updateProductUrl(value: string) {
    const trimmed = value.trimStart();
    const startsWithLink = /^(?:https?:\/\/|www\.)/i.test(trimmed)
      || /^[a-z\d][a-z\d.-]*\.[a-z]{2,}(?:[/:?#]|$)/i.test(trimmed);
    const normalized = normalizeProductUrlInput(value);
    const nextValue = startsWithLink || !normalized ? value : normalized;
    setForm((current) => ({ ...current, url: nextValue }));
    if (!activeProduct) scheduleProductPreview(nextValue);
  }

  function openNewProduct(seed?: Partial<typeof blankProduct>) {
    setActiveProduct(null);
    setForm({ ...blankProduct, ...seed });
    productNameEdited.current = Boolean(seed?.name?.trim());
    productTypeEdited.current = Boolean(seed?.type?.trim());
    suggestedProductName.current = "";
    suggestedProductType.current = "";
    setProductPreview(null);
    setProductPreviewLoading(false);
    setProductPreviewError("");
    setModalOpen(true);
    setError("");
    scheduleProductPreview(seed?.url ?? "");
  }

  function openEdit(product: Product) {
    cancelProductPreview();
    setActiveProduct(product);
    setForm({ name: product.name, type: product.type, url: product.url, position: product.position, audience: product.audience });
    productNameEdited.current = true;
    productTypeEdited.current = true;
    suggestedProductName.current = "";
    suggestedProductType.current = "";
    setProductPreview(null);
    setProductPreviewLoading(false);
    setProductPreviewError("");
    setModalOpen(true);
    setError("");
  }

  function closeProductModal() {
    cancelProductPreview();
    setModalOpen(false);
    setProductPreview(null);
    setProductPreviewLoading(false);
    setProductPreviewError("");
    setError("");
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeProduct && productPreviewLoading) {
      setError("Wait for the link check to finish before adding this product.");
      return;
    }
    if (!form.name.trim()) {
      setError("Enter a product name before saving.");
      return;
    }
    const normalizedUrl = form.url.trim() ? normalizeProductUrlInput(form.url) : "";
    if (form.url.trim() && !normalizedUrl) {
      setError("Enter a valid public website, Google Play, or App Store link.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const endpoint = activeProduct ? `/api/products/${activeProduct.id}` : "/api/products";
      const matchingPreview = !activeProduct && productPreview?.url === normalizedUrl ? productPreview : null;
      const payload = {
        ...form,
        url: normalizedUrl,
        ...(activeProduct ? {} : {
          iconUrl: matchingPreview?.iconUrl ?? "",
          currentListing: matchingPreview?.currentListing,
        }),
      };
      const response = await fetch(endpoint, { method: activeProduct ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save product.");
      await loadProducts();
      setModalOpen(false);
      if (activeProduct) {
        setActiveProduct(data.product);
        setView("Product workspace");
        setNotice("Product details saved.");
        window.setTimeout(() => setNotice(""), 3200);
      } else {
        setNotice(data.currentListingSaved === false && matchingPreview?.currentListing
          ? `${form.name} added. Store details can be fetched again in Optimize.`
          : `${form.name} added. Building its first semantic core…`);
        void generateResearch(data.product);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save product.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`Delete ${product.name}? This removes its research, optimization, creation, publishing, and promo-event records.`)) return;
    setError("");
    try {
      const response = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not delete product.");
      setProducts((current) => current.filter((item) => item.id !== product.id));
      setCalendarEvents((current) => current.filter((item) => item.productId !== product.id));
      if (activeProduct?.id === product.id) { setActiveProduct(null); setView("Products"); }
      setNotice(`${product.name} deleted.`);
      window.setTimeout(() => setNotice(""), 3200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete product.");
    }
  }

  async function saveResearch(event?: FormEvent<HTMLFormElement>, nextView?: string) {
    event?.preventDefault();
    if (!activeProduct) return;
    setResearchSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/products/${activeProduct.id}/research`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(research) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save the research brief.");
      setResearch(data.research);
      setNotice(nextView ? `Research saved. Opening ${nextView}.` : "Research brief saved and ready for the next module.");
      window.setTimeout(() => setNotice(""), 3200);
      if (nextView) chooseProductView(nextView);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the research brief.");
    } finally {
      setResearchSaving(false);
    }
  }

  function connectGooglePlayWithOAuth(payload: { packageName: string; locale: string; label: string }) {
    if (!activeProduct) return;
    setOauthConnecting(true);
    const params = new URLSearchParams({ packageName: payload.packageName, locale: payload.locale, label: payload.label });
    window.location.assign(new URL(`/api/products/${activeProduct.id}/connections/google-play/oauth/start?${params.toString()}`, window.location.origin).toString());
  }

  async function syncGooglePlayConnection() {
    if (!activeProduct) return;
    setConnectionSyncing(true);
    setError("");
    try {
      const response = await fetch(`/api/products/${activeProduct.id}/connections/google-play/sync`, { method: "POST" });
      const data = await response.json();
      if (data.connection) setConnection(data.connection);
      if (data.oauthConnection) setOauthConnection(data.oauthConnection);
      if (!response.ok) throw new Error(data.error ?? "Could not sync the Google Play listing.");
      if (data.currentListing) setOptimization((current) => ({ ...current, productId: activeProduct.id, currentListing: data.currentListing }));
      setNotice("Authenticated Google Play listing synced into Optimize.");
      window.setTimeout(() => setNotice(""), 4200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sync the Google Play listing.");
    } finally {
      setConnectionSyncing(false);
    }
  }

  async function disconnectGooglePlay() {
    if (!activeProduct || !window.confirm("Disconnect Google Play from this product? The saved listing and imported reports will remain, but stored Play access and report-bucket credentials will be removed.")) return;
    setError("");
    try {
      const response = await fetch(`/api/products/${activeProduct.id}/connections`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not disconnect Google Play.");
      setConnection(null);
      setOauthConnection(null);
      setNotice("Google Play disconnected. Existing workspace data was kept.");
      window.setTimeout(() => setNotice(""), 4200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect Google Play.");
    }
  }

  async function generateResearch(product: Product) {
    setAiGenerating(true);
    setError("");
    setActiveProduct(product);
    setView("Research");
    try {
      const response = await fetch(`/api/products/${product.id}/research/generate`, { method: "POST", headers: { "content-type": "application/json" } });
      const data = await response.json();
      if (!response.ok) throw new Error(generationErrorMessage(data, "Could not build the semantic core."));
      setResearch(data.research);
      setNotice(`AI built a first semantic core with ${completedModelLabel(data.model, data.fallbacksUsed)}. Review it before using it in store or answer-engine copy.`);
      window.setTimeout(() => setNotice(""), 4200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the semantic core.");
    } finally {
      setAiGenerating(false);
    }
  }

  async function saveOptimization(event?: FormEvent<HTMLFormElement>, nextView?: string) {
    event?.preventDefault();
    if (!activeProduct) return;
    setOptimizationSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/products/${activeProduct.id}/optimize`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(optimization) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save the optimization plan.");
      setOptimization(data.optimization);
      setNotice(nextView ? `Optimization saved. Opening ${nextView}.` : "Listing draft saved. Nothing was published.");
      window.setTimeout(() => setNotice(""), 3200);
      if (nextView) chooseProductView(nextView);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the optimization plan.");
    } finally {
      setOptimizationSaving(false);
    }
  }

  async function generateOptimization(product: Product) {
    setOptimizationGenerating(true);
    setError("");
    setActiveProduct(product);
    setView("Optimize");
    try {
      const response = await fetch(`/api/products/${product.id}/optimize/generate`, { method: "POST", headers: { "content-type": "application/json" } });
      const data = await response.json();
      if (!response.ok) throw new Error(generationErrorMessage(data, "Could not build the optimization plan."));
      setOptimization(data.optimization);
      setNotice(`AI built an optimization plan with ${completedModelLabel(data.model, data.fallbacksUsed)}. Review it before publishing anything.`);
      window.setTimeout(() => setNotice(""), 4200);
    } catch (err) {
      const generationError = err instanceof Error ? err.message : "Could not build the optimization plan.";
      setError(`${generationError} Your saved draft was not changed. Retry generation or edit it manually.`);
    } finally {
      setOptimizationGenerating(false);
    }
  }

  async function saveCreate(event?: FormEvent<HTMLFormElement>, nextView?: string) {
    event?.preventDefault();
    if (!activeProduct) return;
    setCreateSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/products/${activeProduct.id}/create`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(createBrief) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save the creation brief.");
      setCreateBrief(data.create);
      setNotice(nextView ? `Creation brief saved. Opening ${nextView}.` : "Creation brief saved. Nothing was published.");
      window.setTimeout(() => setNotice(""), 3200);
      if (nextView) chooseProductView(nextView);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the creation brief.");
    } finally {
      setCreateSaving(false);
    }
  }

  async function generateCreate(product: Product) {
    setCreateGenerating(true);
    setError("");
    setActiveProduct(product);
    setView("Create");
    try {
      const response = await fetch(`/api/products/${product.id}/create/generate`, { method: "POST", headers: { "content-type": "application/json" } });
      const data = await response.json();
      if (!response.ok) throw new Error(generationErrorMessage(data, "Could not build the creation brief."));
      setCreateBrief(data.create);
      setNotice(`AI built a creation brief with ${completedModelLabel(data.model, data.fallbacksUsed)}. Review it before using any copy or creative direction.`);
      window.setTimeout(() => setNotice(""), 4200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the creation brief.");
    } finally {
      setCreateGenerating(false);
    }
  }

  async function savePublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeProduct) return;
    setPublishSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/products/${activeProduct.id}/publish`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(publish) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save the publishing workspace.");
      setPublish(data.publish);
      setNotice(data.statusAdjusted ? "Saved as In review. Complete the source stages and release checklist before marking it ready." : "Publishing workspace saved. No store changes were made.");
      window.setTimeout(() => setNotice(""), 3200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the publishing workspace.");
    } finally {
      setPublishSaving(false);
    }
  }

  async function exportPublishPacket(product: Product, plan: PublishPlan) {
    setError("");
    try {
      const responses = await Promise.all([
        fetch(`/api/products/${product.id}/research`, { cache: "no-store" }),
        fetch(`/api/products/${product.id}/optimize`, { cache: "no-store" }),
        fetch(`/api/products/${product.id}/create`, { cache: "no-store" }),
      ]);
      const resourceNames = ["research", "optimization", "creation"];
      const payloads = await Promise.all(responses.map(async (response, index) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error ?? `Could not load the ${resourceNames[index]} section for export.`);
        return data;
      }));
      const [researchData, optimizationData, createData] = payloads;
      const packet = { exportedAt: new Date().toISOString(), product, publish: plan, research: researchData.research ?? null, optimization: optimizationData.optimization ?? null, create: createData.create ?? null };
      const blob = new Blob([JSON.stringify(packet, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${product.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "product"}-publish-packet.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setNotice("Publish packet exported for review.");
      window.setTimeout(() => setNotice(""), 3200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export the publish packet.");
    }
  }

  function openNewEvent(startDate?: string) {
    const productId = activeProduct?.id ?? products[0]?.id ?? 0;
    const event = createBlankPromoEvent(productId);
    if (startDate) {
      event.startDate = startDate;
      event.endDate = startDate;
    }
    setEventDraft(event);
    setCalendarDraftMode("new");
    setView("Calendar");
    setError("");
  }

  function openCalendarEvent(event: PromoEvent) {
    setEventDraft(event);
    setCalendarDraftMode("saved");
    setError("");
  }

  function updateCalendarDraft(event: PromoEvent) {
    setEventDraft(event);
    setCalendarDraftMode(event.id ? "saved" : "new");
  }

  async function saveCalendarEvent(event: PromoEvent, quiet = false): Promise<PromoEvent | null> {
    if (!event.productId) {
      setError("Choose a product before saving this event.");
      return null;
    }
    if (event.startDate && event.endDate && event.endDate < event.startDate) {
      setError("End date must be on or after the start date.");
      return null;
    }
    setCalendarSaving(true);
    setError("");
    try {
      const response = await fetch(event.id ? `/api/calendar/${event.id}` : "/api/calendar", { method: event.id ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save the promo event.");
      const saved = data.event as PromoEvent;
      setCalendarEvents((current) => event.id ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved].sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999")));
      setEventDraft(saved);
      setCalendarDraftMode("saved");
      if (!quiet) {
        setNotice("Promo event saved. Nothing was published.");
        window.setTimeout(() => setNotice(""), 3200);
      }
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the promo event.");
      return null;
    } finally {
      setCalendarSaving(false);
    }
  }

  async function rescheduleCalendarEvent(event: PromoEvent, startDate: string, endDate: string) {
    const saved = await saveCalendarEvent({ ...event, startDate, endDate }, true);
    if (!saved) return;
    setCalendarDraftMode("auto");
    setNotice(event.title + " moved to " + startDate + (endDate !== startDate ? " – " + endDate : "") + ".");
    window.setTimeout(() => setNotice(""), 3200);
  }

  async function deleteCalendarEvent(event: PromoEvent) {
    if (!event.id || !window.confirm(`Delete ${event.title || "this event"}?`)) return;
    setError("");
    try {
      const response = await fetch(`/api/calendar/${event.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not delete the promo event.");
      setCalendarEvents((current) => current.filter((item) => item.id !== event.id));
      setEventDraft({ ...blankPromoEvent, productId: products[0]?.id ?? 0 });
      setCalendarDraftMode("new");
      setNotice("Promo event deleted.");
      window.setTimeout(() => setNotice(""), 3200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the promo event.");
    }
  }

  async function generateCalendarStrategy(event: PromoEvent) {
    if (!event.productId) {
      setError("Choose a product before building this event.");
      return;
    }
    if (Object.values(event.eventBrief ?? {}).some((value) => typeof value === "string" && value.trim()) && !window.confirm("Regenerate the strategy? This replaces the current event brief. Existing channel drafts will stay saved and may need a review.")) return;
    setCalendarGenerating(true);
    setError("");
    try {
      const response = await fetch("/api/calendar/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...event, eventId: event.id, stage: "strategy", eventIdea: event.title.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error([data.error, data.detail].filter(Boolean).join(" ") || "Could not generate the event strategy.");
      const generated = data.event as PromoEvent;
      setCalendarEvents((current) => generated.id && current.some((item) => item.id === generated.id) ? current.map((item) => item.id === generated.id ? generated : item) : [...current, generated].sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999")));
      setEventDraft(generated);
      setCalendarDraftMode(generated.id ? "saved" : "new");
      setNotice(`Strategy drafted with ${completedModelLabel(data.model, data.fallbacksUsed)}. Review it, then build each channel when ready.`);
      window.setTimeout(() => setNotice(""), 4200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the event strategy.");
    } finally {
      setCalendarGenerating(false);
    }
  }

  async function generateCalendarChannel(event: PromoEvent, channel: PromoChannel, locale?: "en" | "ar") {
    if (!event.productId) {
      setError("Choose a product before building this channel draft.");
      return;
    }
    if (!Object.values(event.eventBrief ?? {}).some((value) => typeof value === "string" && value.trim())) {
      setError("Add the event details before drafting channel content.");
      return;
    }
    const localeDraft = event.localization.find((item) => item.locale === locale);
    const draftKeys = { googlePlay: "google", appleEvent: "apple", siteEntry: "site", creative: "creative" } as const;
    const hasExistingDraft = channel === "localization" ? Boolean(localeDraft?.tagline || localeDraft?.description) : promoEventStageDrafts(event)[draftKeys[channel]];
    if (hasExistingDraft && !window.confirm("Replace this channel’s current draft? Other channels will stay unchanged.")) return;
    setCalendarGenerating(true);
    setError("");
    try {
      const saved = await saveCalendarEvent(event, true);
      if (!saved?.id) return;
      const response = await fetch("/api/calendar/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...saved, eventId: saved.id, stage: "channel", channel, ...(channel === "localization" ? { locale } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error([data.error, data.detail].filter(Boolean).join(" ") || "Could not generate this channel draft.");
      const generated = data.event as PromoEvent;
      setCalendarEvents((current) => current.map((item) => item.id === generated.id ? generated : item));
      setEventDraft(generated);
      setCalendarDraftMode("saved");
      const names: Record<PromoChannel, string> = { googlePlay: "Google Play", appleEvent: "Apple", siteEntry: "AEO / SEO", localization: `${locale === "ar" ? "Arabic" : "English"} localization`, creative: "creative" };
      setNotice(`${names[channel]} draft saved with ${completedModelLabel(data.model, data.fallbacksUsed)}. Review and edit it before use.`);
      window.setTimeout(() => setNotice(""), 4200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate this channel draft.");
    } finally {
      setCalendarGenerating(false);
    }
  }

  function exportCalendarEvent(event: PromoEvent) {
    const validationErrors = promoReviewErrors(event);
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), delivery: "Not submitted by Sorted", reviewIssues: validationErrors, event }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "promo-event"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Promo event package exported for review.");
    window.setTimeout(() => setNotice(""), 3200);
  }

  function chooseView(next: string) {
    setFocusExperimentsOnOpen(false);
    setExperimentOpportunityOnOpen(undefined);
    setActiveProduct(null);
    setView(next);
  }

  function chooseProductView(next: string) {
    if (next !== "Optimize") {
      setFocusExperimentsOnOpen(false);
      setExperimentOpportunityOnOpen(undefined);
    }
    if (!activeProduct) return chooseView("Products");
    setView(next);
  }

  function selectWorkspaceScope(product: Product | null) {
    const currentViewIsProductTool = [...productNavItems, ...secondaryProductItems].some((item) => item.view === view);
    if (product) {
      setActiveProduct(product);
      if (!currentViewIsProductTool) setView("Product workspace");
      return;
    }
    setActiveProduct(null);
    if (activeProduct && currentViewIsProductTool) setView(view === "Calendar" ? "Calendar" : "Overview");
  }

  return (
    <main className="sorted-app">
      <aside className="sorted-sidebar">
        <button className="sorted-brand" onClick={() => chooseView("Overview")} type="button" aria-label="Go to Sorted overview">
          <span className="brand-mark">3</span>
          <span><strong>sort3d</strong><small>organic growth workspace</small></span>
        </button>
        <ProductSwitcher products={products} activeProduct={activeProduct} onSelectProduct={selectWorkspaceScope} onManageProducts={() => chooseView("Products")} />
        <nav className="sorted-nav" aria-label="Primary navigation">
          {!activeProduct && <p className="nav-label">All products</p>}
          {!activeProduct && workspaceNavItems.map((item) => {
            const isCurrent = !activeProduct && view === item.view;
            return <button className={`nav-item ${isCurrent ? "active" : ""}`} key={item.view} onClick={() => chooseView(item.view)} aria-current={isCurrent ? activeProduct ? "location" : "page" : undefined}><span className="nav-icon">{item.icon}</span>{item.label}</button>;
          })}
          {activeProduct && <>
            <div className="nav-divider" />
            <p className="nav-label product-nav-label">This product</p>
            {productNavItems.map((item) => <button className={`nav-item product-nav-item ${(view === item.view || (item.view === "Settings" && secondaryProductItems.some((entry) => entry.view === view))) ? "active" : ""}`} key={item.view} onClick={() => chooseProductView(item.view)} aria-current={view === item.view ? "page" : undefined}><span className="nav-icon">{item.icon}</span>{item.label}</button>)}
          </>}
        </nav>
      </aside>

      <section className="sorted-main">
          <header className="sorted-topbar"><nav className="crumb" aria-label="Breadcrumb">
            <button className="breadcrumb-link" type="button" onClick={() => chooseView("Overview")}>Workspace</button>
            <span className="crumb-separator" aria-hidden="true">/</span>
            {activeProduct ? <>
              <button className="breadcrumb-link breadcrumb-product" type="button" onClick={() => { setFocusExperimentsOnOpen(false); setExperimentOpportunityOnOpen(undefined); setView("Product workspace"); }} aria-current={view === "Product workspace" ? "page" : undefined}>{activeProduct.name}</button>
              <span className="crumb-separator" aria-hidden="true">/</span>
              <label className="breadcrumb-section">
                <span className="sr-only">Product section</span>
                <select value={secondaryProductItems.some((item) => item.view === view) ? "Settings" : view} onChange={(event) => chooseProductView(event.target.value)} aria-label="Switch product section">
                  {productNavItems.map((item) => <option value={item.view} key={item.view}>{item.label}</option>)}
                </select>
                <span className="breadcrumb-section-arrow" aria-hidden="true">⌄</span>
              </label>
            </> : <span className="breadcrumb-current" aria-current="page">{view}</span>}
          </nav><div className="top-actions"><button className="icon-button" type="button" aria-label="Search workspace" onClick={() => setSearchOpen(true)}>⌕</button></div></header>
          <nav className="mobile-navigation" aria-label="Workspace navigation">
            <ProductSwitcher products={products} activeProduct={activeProduct} onSelectProduct={selectWorkspaceScope} onManageProducts={() => chooseView("Products")} mobile />
            {!activeProduct && <div className="mobile-nav-group" role="group" aria-label="Account sections">
              {workspaceNavItems.map((item) => {
                const isCurrent = !activeProduct && view === item.view;
                return <button type="button" className={`mobile-nav-item ${isCurrent ? "active" : ""}`} key={item.view} onClick={() => chooseView(item.view)} aria-current={isCurrent ? activeProduct ? "location" : "page" : undefined}><span>{item.icon}</span>{item.label}</button>;
              })}
            </div>}
            {activeProduct && <div className="mobile-product-navigation"><div className="mobile-nav-group" role="group" aria-label={`${activeProduct.name} sections`}>
              {productNavItems.map((item) => <button type="button" className={`mobile-nav-item ${view === item.view ? "active" : ""}`} key={item.view} onClick={() => chooseProductView(item.view)} aria-current={view === item.view ? "page" : undefined}><span>{item.icon}</span>{item.label}</button>)}
            </div></div>}
          </nav>
        <div className="sorted-content">
          <div className={`content-heading${activeProduct && view !== "Product workspace" ? " section-context-heading" : ""}`}><div><p className="eyebrow">{activeProduct ? "Product workspace" : "Sorted workspace"}</p><h1>{greeting}</h1><p className="subheading">{activeProduct ? "Improve your listing. Plan promotions. Learn from results." : "One calm place for every organic marketing decision."}</p></div>{!activeProduct && <button className="primary-button" onClick={() => openNewProduct()}><span>＋</span> Add product</button>}{activeProduct && <button className="secondary-button" onClick={() => openEdit(activeProduct)}>Edit product</button>}</div>

          {notice && <div className="notice" role="status" aria-live="polite" aria-atomic="true"><span aria-hidden="true">✓</span><span className="notice-message">{notice}</span><button type="button" className="banner-dismiss" onClick={() => setNotice("")} aria-label="Dismiss confirmation">×</button></div>}
          {error && !modalOpen && <div className="error-banner" role="alert" aria-atomic="true"><div><strong>Something needs attention.</strong> {error}</div><button type="button" className="banner-dismiss" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}

          {activeProduct ? view === "Results" ? <section className="listing-workspace"><div className="listing-heading"><div><h2>Results</h2><p>Keep store performance separate from app quality. Missing data is not zero.</p></div></div><GooglePlayPerformanceImporter key={activeProduct.id} productId={activeProduct.id} productName={activeProduct.name} onOpenExperiments={(opportunityTitle) => { setExperimentOpportunityOnOpen(opportunityTitle); setFocusExperimentsOnOpen(true); setView("Optimize"); }} onOpenConnections={() => setView("Connections")} /></section> : view === "Settings" ? <section className="listing-workspace"><div className="listing-heading"><div><h2>Product settings</h2><p>Your shared context and connections. Existing work is preserved.</p></div></div><div className="product-job-grid">{secondaryProductItems.map((item) => <button type="button" className="product-job-card" key={item.view} onClick={() => setView(item.view)}><strong>{item.label}</strong><span>{item.view === "Research" ? "Research, audience and evidence reused by AI." : item.view === "Connections" ? "Manage Google Play access and refresh the listing." : item.view === "Create" ? "Previously saved variants, answers and creative direction." : "Previous multi-channel handoff plans. Store updates now use Review & send."}</span></button>)}</div></section> : view === "Connections" ? <GooglePlayConnectionView key={`${connection?.id ?? "none"}:${connection?.status ?? "none"}:${oauthConnection?.id ?? "none"}:${oauthConnection?.status ?? "none"}:${oauthConnection?.updatedAt ?? ""}`} product={activeProduct} connection={connection} oauthConnection={oauthConnection} loading={connectionLoading} syncing={connectionSyncing} connectingOAuth={oauthConnecting} onConnectOAuth={connectGooglePlayWithOAuth} onSync={syncGooglePlayConnection} onDisconnect={disconnectGooglePlay} onBack={() => setView("Product workspace")} /> : view === "Research" ? <ResearchView product={activeProduct} research={research} loading={researchLoading} saving={researchSaving} generating={aiGenerating} onChange={setResearch} onSave={saveResearch} onSaveAndContinue={() => void saveResearch(undefined, "Optimize")} onGenerate={() => generateResearch(activeProduct)} onBack={() => setView("Product workspace")} /> : view === "Optimize" ? <ListingWorkspace key={activeProduct.id} product={activeProduct} optimization={optimization} loading={optimizationLoading} saving={optimizationSaving} generating={optimizationGenerating} onChange={setOptimization} onSave={() => void saveOptimization()} onGenerate={() => generateOptimization(activeProduct)} onSettings={() => { setFocusExperimentsOnOpen(false); setExperimentOpportunityOnOpen(undefined); setView("Connections"); }} initialSection={focusExperimentsOnOpen ? "experiments" : "copy"} initialExperimentOpportunity={experimentOpportunityOnOpen} onSectionChange={() => { setFocusExperimentsOnOpen(false); setExperimentOpportunityOnOpen(undefined); }} /> : view === "Create" ? <CreateView product={activeProduct} create={createBrief} loading={createLoading} saving={createSaving} generating={createGenerating} onChange={setCreateBrief} onSave={saveCreate} onSaveAndContinue={() => void saveCreate(undefined, "Calendar")} onGenerate={() => generateCreate(activeProduct)} onBack={() => setView("Product workspace")} /> : view === "Publish" ? <PublishView product={activeProduct} publish={publish} readiness={publishReadiness} loading={publishLoading} saving={publishSaving} onChange={setPublish} onSave={savePublish} onExport={() => exportPublishPacket(activeProduct, publish)} onBack={() => setView("Product workspace")} /> : view === "Calendar" ? <CalendarView editorOpen={visibleCalendarEditorOpen} onReschedule={rescheduleCalendarEvent} products={calendarProducts} events={visibleCalendarEvents} draft={visibleCalendarDraft} loading={calendarLoading} saving={calendarSaving} generating={calendarGenerating} onNew={openNewEvent} onSelect={openCalendarEvent} onChange={updateCalendarDraft} onSave={saveCalendarEvent} onClose={() => setCalendarDraftMode("auto")} onGenerateStrategy={generateCalendarStrategy} onGenerateChannel={generateCalendarChannel} onExport={exportCalendarEvent} onDelete={deleteCalendarEvent} /> : <ProductWorkspace product={activeProduct} report={reports.products.find((item) => item.id === activeProduct.id)} loading={reportsLoading} onNavigate={chooseProductView} onRetry={() => void loadReports()} /> : view === "Calendar" ? <CalendarView editorOpen={visibleCalendarEditorOpen} onReschedule={rescheduleCalendarEvent} products={calendarProducts} events={visibleCalendarEvents} draft={visibleCalendarDraft} loading={calendarLoading} saving={calendarSaving} generating={calendarGenerating} onNew={openNewEvent} onSelect={openCalendarEvent} onChange={updateCalendarDraft} onSave={saveCalendarEvent} onClose={() => setCalendarDraftMode("auto")} onGenerateStrategy={generateCalendarStrategy} onGenerateChannel={generateCalendarChannel} onExport={exportCalendarEvent} onDelete={deleteCalendarEvent} /> : view === "Products" ? <ProductsView products={products} loading={loading} onOpen={(product) => { setActiveProduct(product); setView("Product workspace"); }} onEdit={openEdit} onDelete={deleteProduct} onAdd={() => openNewProduct()} onTry={() => openNewProduct({ name: "Void Stack", type: "Game", position: "A fast, satisfying stack-building game", audience: "Players who want a quick challenge" })} /> : view === "Reports" ? <ReportsView reports={reports} loading={reportsLoading} onOpen={(product) => { setActiveProduct(product); setView(product.nextAction.view); }} onAdd={() => openNewProduct()} /> : <OverviewView products={products} loading={loading} reports={reports} reportsLoading={reportsLoading} onAdd={() => openNewProduct()} onOpen={(product) => { setActiveProduct(product); setView("Product workspace"); }} onProducts={() => chooseView("Products")} />}
        </div>
      </section>

      {searchOpen && <div className="search-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSearchOpen(false); }}><div className="search-dialog" role="dialog" aria-modal="true" aria-label="Search workspace"><div className="search-dialog-heading"><div><p className="eyebrow">Workspace search</p><h2>Find a product</h2></div><button type="button" className="close-button" onClick={() => setSearchOpen(false)}>×</button></div><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setSearchOpen(false); }} placeholder="Search products by name, type, or audience" />{(() => { const query = searchQuery.trim().toLowerCase(); const matches = products.filter((product) => [product.name, product.type, product.position, product.audience].some((value) => value.toLowerCase().includes(query))); return <div className="search-results">{matches.length ? matches.map((product) => <button type="button" className="search-result" key={product.id} onClick={() => { setActiveProduct(product); setView("Product workspace"); setSearchOpen(false); setSearchQuery(""); }}><ProductAvatar product={product} /><span><strong>{product.name}</strong><small>{product.type} · {product.audience || "Audience not set"}</small></span><span>→</span></button>) : <p className="search-empty">No matching products.</p>}</div>; })()}</div></div>}
      {modalOpen && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title" onSubmit={saveProduct}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{activeProduct ? "Edit product" : "New product"}</p>
                <h2 id="product-modal-title">{activeProduct ? "Keep the foundation current" : "Add a product to Sorted"}</h2>
              </div>
              <button type="button" className="close-button" onClick={closeProductModal} aria-label="Close product form">×</button>
            </div>
            <p className="modal-intro">
              {activeProduct
                ? "Update the details every module shares."
                : "Start with a live website or store link. Sorted will fill in available details for you to review."}
            </p>
            {error && <div className="modal-error" role="alert">{error}<button type="button" className="banner-dismiss" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
            <label>Product URL <span className="optional">optional</span>
              <input
                autoFocus={!activeProduct}
                value={form.url}
                onChange={(event) => updateProductUrl(event.target.value)}
                placeholder="Paste a website, Google Play, or App Store link"
                autoComplete="url"
                inputMode="url"
              />
            </label>
            {!activeProduct && productPreviewLoading && <p className="product-import-status" role="status">Checking the live page or store listing…</p>}
            {!activeProduct && productPreviewError && <p className="product-import-error" role="alert">{productPreviewError} You can still add the product manually. <button type="button" className="product-import-retry" onClick={() => updateProductUrl(form.url)}>Try again</button></p>}
            {!activeProduct && productPreview && (
              <div className="product-import-preview" role="status" aria-live="polite">
                <ProductAvatar product={{
                  id: 0,
                  name: productPreview.name || productPreview.sourceLabel,
                  type: productPreview.productType,
                  url: productPreview.url,
                  iconUrl: productPreview.iconUrl,
                  position: "",
                  audience: "",
                  updatedAt: "",
                }} size="large" />
                <div className="product-import-copy">
                  <strong>{productPreview.name || (productPreview.sourceLabel + " link")}</strong>
                  <small>{[productPreview.sourceLabel, productPreview.currentListing?.category, productPreview.currentListing?.developer].filter(Boolean).join(" · ")}</small>
                  {productPreview.currentListing?.longDescription && <p>{productPreview.currentListing.longDescription.slice(0, 360)}{productPreview.currentListing.longDescription.length > 360 ? "…" : ""}</p>}
                  <span>{productPreview.message || (productPreview.available
                    ? "Details found. Review the suggested name and type before adding."
                    : "Details weren’t available. Enter the name manually.")}</span>
                </div>
              </div>
            )}
            <label>Product name
              <input
                required
                pattern=".*\S.*"
                title="Enter a product name containing at least one non-space character."
                value={form.name}
                onChange={(event) => { productNameEdited.current = true; setForm({ ...form, name: event.target.value }); }}
                placeholder="e.g. Void Stack"
              />
            </label>
            <label>What is it?
              <select value={form.type} onChange={(event) => { productTypeEdited.current = true; setForm({ ...form, type: event.target.value }); }}>
                <option>Mobile app</option>
                <option>Game</option>
                <option>Website</option>
                <option>Client product</option>
              </select>
            </label>
            <label>Positioning <span className="optional">optional</span>
              <textarea value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} placeholder="What makes it worth choosing?" rows={3} />
            </label>
            <label>Audience <span className="optional">optional</span>
              <input value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value })} placeholder="Who is this for?" />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={closeProductModal}>Cancel</button>
              <button className="primary-button" disabled={saving || (!activeProduct && productPreviewLoading)}>{saving ? "Saving…" : !activeProduct && productPreviewLoading ? "Checking link…" : activeProduct ? "Save changes" : "Add product"}</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function OverviewView({ products, loading, reports, reportsLoading, onAdd, onOpen, onProducts }: { products: Product[]; loading: boolean; reports: ReportsData; reportsLoading: boolean; onAdd: () => void; onOpen: (product: Product) => void; onProducts: () => void }) {
  return <>
    <div className="metrics"><Metric value={reportsLoading ? "—" : String(products.length).padStart(2, "0")} label="Products" tone="mint" /><Metric value={reportsLoading ? "—" : String(reports.summary.foundationReady).padStart(2, "0")} label="Foundations ready" tone="violet" /><Metric value={reportsLoading ? "—" : String(reports.summary.completeWorkspaces).padStart(2, "0")} label="Workspaces complete" tone="amber" /><Metric value={reportsLoading ? "—" : String(reports.summary.readyForHandoff).padStart(2, "0")} label="Ready for handoff" tone="blue" /></div>
    <div className="dashboard-grid"><section className="panel portfolio-panel"><div className="panel-heading"><div><p className="eyebrow">Portfolio</p><h2>Products in motion</h2></div><button className="text-button" onClick={onProducts}>View all <span>→</span></button></div>{loading ? <div className="loading-line">Loading your workspace…</div> : products.length ? <div className="product-list">{products.slice(0, 4).map((product) => <ProductRow key={product.id} product={product} onClick={() => onOpen(product)} />)}</div> : <EmptyPortfolio onAdd={onAdd} />}</section><section className="panel pulse-panel"><div className="panel-heading"><div><p className="eyebrow">Organic pulse</p><h2>Make the next move</h2></div><span className="pulse-icon">✦</span></div><div className="pulse-card"><div className="pulse-number">{products.length ? "01" : "00"}</div><div><strong>{products.length ? "Review your product foundation" : "Add your first product"}</strong><p>{products.length ? "A clear position and audience unlock better research, copy, and publishing decisions." : "Sorted will build every future tool around this shared foundation."}</p></div></div><button className="wide-button" onClick={products.length ? onProducts : onAdd}>{products.length ? "Open product hub" : "Get started"}<span>→</span></button></section></div>
  </>;
}

function ProductsView({ products, loading, onOpen, onEdit, onDelete, onAdd, onTry }: { products: Product[]; loading: boolean; onOpen: (product: Product) => void; onEdit: (product: Product) => void; onDelete: (product: Product) => void; onAdd: () => void; onTry: () => void }) {
  return <section className="products-view">
    <div className="section-intro"><div><p className="eyebrow">Product hub</p><h2>Build from one source of truth</h2><p>Every product gets its own workspace. Research, optimize, create, publish, and report without losing the thread.</p></div><span className="product-count">{products.length} {products.length === 1 ? "product" : "products"}</span></div>
    {loading ? <div className="loading-line">Loading your products…</div> : products.length ? <div className="product-grid">
      {products.map((product) => <article className="product-card" key={product.id}>
        <div className="product-card-top"><span className="product-type">{product.type}</span><button type="button" className="more-button" onClick={() => onEdit(product)} aria-label={`Edit ${product.name}`} title="Edit product">···</button></div>
        <div className="product-card-main" role="button" tabIndex={0} aria-label={`Open ${product.name} workspace`} onClick={() => onOpen(product)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(product); } }}>
          <h3>{product.name}</h3><p>{product.position || "Add positioning to give every module a sharper brief."}</p>
          <div className="product-card-meta"><span>{product.audience || "Audience not set"}</span><small>Updated {formatDate(product.updatedAt)}</small></div>
          <span className="product-card-open-label">Open workspace <span>→</span></span>
        </div>
        <button type="button" className="danger-text product-card-delete" onClick={() => onDelete(product)}>Delete</button>
      </article>)}
      <button type="button" className="add-card" onClick={onAdd}><span>＋</span><strong>Add another product</strong><small>Start a new organic growth workspace</small></button>
    </div> : <div className="empty-products"><div className="empty-orbit">✦</div><h3>Your product hub starts here</h3><p>Add a real product or use the example to see how Sorted organizes the work around it.</p><div className="empty-actions"><button type="button" className="primary-button" onClick={onTry}>Try Void Stack</button><button type="button" className="secondary-button" onClick={onAdd}>Add my product</button></div></div>}
  </section>;
}

function ReportsView({ reports, loading, onOpen, onAdd }: { reports: ReportsData; loading: boolean; onOpen: (product: ReportProduct) => void; onAdd: () => void }) {
  return <section className="reports-view"><div className="section-intro"><div><p className="eyebrow">Workspace report</p><h2>Know what is ready to use</h2><p>This readiness report follows the same five stages as each product workspace. It tracks workflow status, not store-performance analytics.</p></div><span className="product-count">Readiness</span></div><div className="metrics report-metrics"><Metric value={String(reports.summary.products).padStart(2, "0")} label="Products" tone="mint" /><Metric value={String(reports.summary.foundationReady).padStart(2, "0")} label="Foundations ready" tone="violet" /><Metric value={String(reports.summary.completeWorkspaces).padStart(2, "0")} label="Core stages ready" tone="amber" /><Metric value={String(reports.summary.promoEvents).padStart(2, "0")} label="Promo events" tone="blue" /></div><div className="report-grid"><section className="panel report-panel"><div className="panel-heading"><div><p className="eyebrow">Product readiness</p><h2>Move each product forward</h2></div><span className="report-note">{reports.summary.readyForHandoff} ready for handoff</span></div>{loading ? <div className="loading-line">Loading the workspace report…</div> : reports.products.length ? <div className="report-product-list">{reports.products.map((product) => { const readyCount = product.workflow.filter((stage) => stage.status === "ready").length; return <article className="report-product" key={product.id}><div className="report-product-heading"><div className="report-product-name"><ProductAvatar product={product} /><div><strong>{product.name}</strong><small>{product.type} · Updated {formatDate(product.updatedAt)}</small></div></div><button className="card-link" type="button" aria-label={`${product.nextAction.buttonLabel} for ${product.name}`} onClick={() => onOpen(product)}>{product.nextAction.buttonLabel} <span aria-hidden="true">→</span></button></div><div className="report-progress-row"><span>{readyCount}/{product.workflow.length} stages ready</span><div className="report-progress"><span style={{ width: `${product.workflow.length ? readyCount / product.workflow.length * 100 : 0}%` }} /></div><small>{product.eventCount} promo {product.eventCount === 1 ? "event" : "events"}</small></div><div className="report-steps" aria-label={`${product.name} stage readiness`}>{product.workflow.map((stage) => <span className={stage.status} key={stage.key}><i aria-hidden="true">{stage.status === "ready" ? "✓" : stage.status === "not-started" ? "○" : "•"}</i> {stage.label} · {workflowStatusLabels[stage.status]}</span>)}</div></article>; })}</div> : <div className="empty-products"><div className="empty-orbit">◒</div><h3>No products to report yet</h3><p>Add your first product and this page will track its path from foundation to handoff.</p><button className="primary-button" onClick={onAdd}>Add product</button></div>}</section><aside className="panel report-guide"><p className="eyebrow">What this means</p><h2>One product, one complete thread.</h2><p>Each stage uses its own saved-work and review checks. Promo packages can be planned before the release handoff is ready.</p><div className="report-guide-list"><div><strong>Foundation</strong><span>Positioning + audience</span></div><div><strong>Core work</strong><span>Research → Optimize → Create</span></div><div><strong>Promo</strong><span>Reusable event package</span></div><div><strong>Handoff</strong><span>Publish marked ready</span></div></div></aside></div></section>;
}

function ProductWorkspace({ product, report, loading, onNavigate, onRetry }: { product: Product; report: ReportProduct | undefined; loading: boolean; onNavigate: (next: string) => void; onRetry: () => void }) {
  return <section className="listing-workspace"><div className="listing-heading"><div><p className="eyebrow">{product.type}</p><h2>What would you like to work on?</h2><p>Start with a task. There is no required sequence.</p></div></div>
    <div className="product-job-grid">
      <button className="product-job-card featured" onClick={() => onNavigate("Optimize")}><small>STORE LISTING</small><strong>Improve how people discover your app</strong><span>Edit English copy, translate selected languages, and review before sending to Google Play.</span><b>Open store listing →</b></button>
      <button className="product-job-card" onClick={() => onNavigate("Calendar")}><small>PROMOTIONS</small><strong>Plan your next event</strong><span>Set dates and prepare content for this product.</span><b>Open calendar →</b></button>
      <button className="product-job-card" onClick={() => onNavigate("Results")}><small>RESULTS</small><strong>Understand the available evidence</strong><span>Review store reports and app quality without confusing them with completed tasks.</span><b>View results →</b></button>
    </div>
    <div className="listing-context overview-context"><strong>Your product context</strong><p>{product.position || "Add positioning and audience in Product settings when you need richer recommendations. This does not block listing edits."}</p><button className="text-button" onClick={() => onNavigate("Settings")}>Product settings →</button></div>
    {loading ? <p role="status">Loading saved work…</p> : report ? <p className="field-help">{report.eventCount} saved promotion{report.eventCount === 1 ? "" : "s"}. Saved content is not a publishing or growth result.</p> : <button className="text-button" onClick={onRetry}>Reload saved work status</button>}
  </section>;
}

function PublishView({ product, publish, readiness, loading, saving, onChange, onSave, onExport, onBack }: { product: Product; publish: PublishPlan; readiness: PublishReadiness; loading: boolean; saving: boolean; onChange: (next: PublishPlan) => void; onSave: (event: FormEvent<HTMLFormElement>) => void; onExport: () => Promise<void>; onBack: () => void }) {
  const [exporting, setExporting] = useState(false);
  const sourcesReady = readiness.research && readiness.optimize && readiness.create;
  const checklistComplete = publish.checklist.length > 0 && publish.checklist.every((item) => item.done === true);
  const canMarkReady = canMarkPublishReady(readiness, publish.checklist);
  const visibleStatus = !canMarkReady && (publish.status === "ready" || publish.status === "published") ? "review" : publish.status;

  async function handleExport() {
    if (loading || !sourcesReady) return;
    setExporting(true);
    try {
      await onExport();
    } finally {
      setExporting(false);
    }
  }

  function updateChannel(index: number, next: Partial<PublishChannel>) {
    onChange({ ...publish, channels: publish.channels.map((item, itemIndex) => itemIndex === index ? { ...item, ...next } : item) });
  }

  function toggleChecklist(index: number) {
    const checklist = publish.checklist.map((item, itemIndex) => itemIndex === index ? { ...item, done: !item.done } : item);
    const status = !canMarkPublishReady(readiness, checklist) && (publish.status === "ready" || publish.status === "published") ? "review" : publish.status;
    onChange({ ...publish, checklist, status });
  }

  const readyCount = Object.values(readiness).filter(Boolean).length;
  const checklistCount = publish.checklist.filter((item) => item.done === true).length;
  const readinessGuidance = loading
    ? "Checking saved source work…"
    : !sourcesReady
      ? "Complete Research, Optimize, and approve Create before exporting the packet."
      : !checklistComplete
        ? "Export is available. Complete the release checklist before marking this handoff ready."
        : "All source and checklist requirements are met. The release remains manual.";

  return (
    <section className="publish-view">
      <div className="research-toolbar">
        <button className="back-button" onClick={onBack}>← {product.name}</button>
        <span>{publish.updatedAt ? `Saved ${formatDate(publish.updatedAt)}` : "Not prepared yet"}</span>
      </div>
      <div className="section-intro publish-intro">
        <div>
          <p className="eyebrow">Publishing workspace</p>
          <h2>Prepare the next release carefully</h2>
          <p>Bring the product’s research, optimization, and creation work into one channel-ready handoff.</p>
        </div>
        <div className="publish-actions">
          <button className="secondary-button" type="button" onClick={() => void handleExport()} disabled={loading || exporting || !sourcesReady} aria-busy={exporting} aria-describedby="publish-readiness-guidance">
            {exporting ? "Exporting…" : "↓ Export packet"}
          </button>
          <select className="status-select publish-status" value={visibleStatus} disabled={loading} aria-label="Publishing handoff status" aria-describedby="publish-readiness-guidance" onChange={(event) => onChange({ ...publish, status: event.target.value as PublishPlan["status"] })}>
            <option value="draft">Draft</option>
            <option value="review">In review</option>
            <option value="ready" disabled={!canMarkReady}>Ready to publish</option>
            <option value="published" disabled={!canMarkReady}>Published</option>
          </select>
        </div>
      </div>
      <p className={`publish-readiness-guidance ${canMarkReady ? "complete" : ""}`} id="publish-readiness-guidance" role="status">
        <strong>{loading ? "Readiness" : canMarkReady ? "Ready checks complete" : "Next step"}</strong>
        <span>{readinessGuidance}</span>
      </p>
      {loading ? <div className="loading-line">Loading the publishing workspace…</div> : (
        <form className="publish-form" onSubmit={onSave}>
          <div className="publish-grid">
            <div className="publish-main">
              <div className="publish-card readiness-card">
                <div className="publish-card-heading">
                  <div><p className="eyebrow">Source readiness</p><h3>Is the handoff grounded?</h3></div>
                  <span className="product-count">{readyCount}/3 ready</span>
                </div>
                <div className="readiness-list">
                  <ReadinessRow label="Research foundation" ready={readiness.research} detail={readiness.research ? "Intent and semantic core are ready" : "Complete Research intent and semantic core"} />
                  <ReadinessRow label="Optimization plan" ready={readiness.optimize} detail={readiness.optimize ? "Required copy is complete and within store limits" : "Complete required ASO / AEO fields and character limits"} />
                  <ReadinessRow label="Creation brief" ready={readiness.create} detail={readiness.create ? "Creation brief is approved" : "Finish and approve the Create brief"} />
                </div>
              </div>
              <div className="publish-card">
                <div className="publish-card-heading">
                  <div><p className="eyebrow">Channel handoff</p><h3>Where should this packet go?</h3></div>
                  <span>Manual release</span>
                </div>
                <div className="channel-list">
                  {publish.channels.map((channel, index) => (
                    <article className="channel-item" key={`${channel.name}-${index}`}>
                      <div className="channel-heading">
                        <div><strong>{channel.name}</strong><small>{channel.lastExportedAt ? `Exported ${formatDate(channel.lastExportedAt)}` : "Not exported yet"}</small></div>
                        <select className="status-select" value={channel.status} aria-label={`${channel.name} handoff status`} onChange={(event) => updateChannel(index, { status: event.target.value as PublishChannel["status"] })}>
                          <option value="draft">Draft</option>
                          <option value="ready">Ready</option>
                          <option value="published">Published</option>
                        </select>
                      </div>
                      <input value={channel.note} onChange={(event) => updateChannel(index, { note: event.target.value })} placeholder="Add a release note or channel-specific handoff" />
                    </article>
                  ))}
                </div>
              </div>
            </div>
            <aside className="publish-side">
              <div className="publish-card checklist-card">
                <div className="publish-card-heading">
                  <div><p className="eyebrow">Release checklist</p><h3>Review before release</h3></div>
                  <span>{checklistCount}/{publish.checklist.length}</span>
                </div>
                <div className="publish-checklist">
                  {publish.checklist.map((item, index) => (
                    <button type="button" className={`publish-check ${item.done ? "done" : ""}`} key={`${item.label}-${index}`} onClick={() => toggleChecklist(index)}>
                      <span className="action-check">{item.done ? "✓" : ""}</span>
                      <span><strong>{item.label}</strong><small>{item.area}</small></span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="publish-card release-notes-card">
                <div className="publish-card-heading">
                  <div><p className="eyebrow">Release notes</p><h3>What changed?</h3></div>
                </div>
                <textarea value={publish.releaseNotes} onChange={(event) => onChange({ ...publish, releaseNotes: event.target.value })} placeholder="Summarize the changes this release is meant to communicate." rows={6} />
              </div>
            </aside>
          </div>
          <div className="research-actions">
            <span>Export prepares a review packet. It does not change any store listing.</span>
            <button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save publishing plan"}</button>
          </div>
        </form>
      )}
    </section>
  );
}
function ReadinessRow({ label, ready, detail }: { label: string; ready: boolean; detail: string }) {
  return <div className="readiness-row"><span className={`readiness-dot ${ready ? "ready" : "missing"}`}>{ready ? "✓" : ""}</span><div><strong>{label}</strong><small>{detail}</small></div><span className={`readiness-label ${ready ? "ready" : "missing"}`}>{ready ? "Ready" : "Missing"}</span></div>;
}

function CreateView({ product, create, loading, saving, generating, onChange, onSave, onSaveAndContinue, onGenerate, onBack }: { product: Product; create: CreateBrief; loading: boolean; saving: boolean; generating: boolean; onChange: (next: CreateBrief) => void; onSave: (event: FormEvent<HTMLFormElement>) => void; onSaveAndContinue: () => void; onGenerate: () => void; onBack: () => void }) {
  const canContinue = Boolean(create.primaryMessage.trim());
  function updateVariant(index: number, next: Partial<CreateVariant>) {
    onChange({ ...create, storeVariants: create.storeVariants.map((item, itemIndex) => itemIndex === index ? { ...item, ...next } : item) });
  }
  function updateAnswer(index: number, next: Partial<AnswerBlock>) {
    onChange({ ...create, answerBlocks: create.answerBlocks.map((item, itemIndex) => itemIndex === index ? { ...item, ...next } : item) });
  }
  function updatePromo(next: Partial<PromoBrief>) {
    onChange({ ...create, promoBrief: { ...create.promoBrief, ...next } });
  }
  function updateCreative(next: Partial<CreativeBrief>) {
    onChange({ ...create, creativeBrief: { ...create.creativeBrief, ...next } });
  }
  return <section className="create-view"><div className="research-toolbar"><button className="back-button" onClick={onBack}>← {product.name}</button><span>{create.updatedAt ? `Saved ${formatDate(create.updatedAt)}` : "Not built yet"}</span></div><div className="section-intro create-intro"><div><p className="eyebrow">Creation workspace</p><h2>Turn strategy into usable briefs</h2><p>Shape store copy, answer-engine responses, promo messaging, and creative direction from the same product truth.</p></div><AiActionButton label="Generate creation brief" generating={generating} onClick={onGenerate} /></div>{loading ? <div className="loading-line">Loading the creation brief…</div> : <form className="create-form" onSubmit={onSave}><div className="create-card create-message-card"><div className="create-card-heading"><div><p className="eyebrow">Message foundation</p><h3>What should every surface communicate?</h3></div><select className="status-select" value={create.status} onChange={(event) => onChange({ ...create, status: event.target.value as CreateBrief["status"] })}><option value="draft">Draft</option><option value="review">In review</option><option value="approved">Approved</option></select></div><label>Primary message<span className="field-help">A short, durable idea that keeps every output aligned.</span><textarea value={create.primaryMessage} onChange={(event) => onChange({ ...create, primaryMessage: event.target.value })} placeholder="The clearest reason this product deserves attention" rows={3} /></label></div><div className="create-card"><div className="create-card-heading"><div><p className="eyebrow">Store copy variants</p><h3>Draft the words people will see</h3></div><span className="product-count">{create.storeVariants.length} variants</span></div>{create.storeVariants.length ? <div className="variant-list">{create.storeVariants.map((variant, index) => <article className="variant-card" key={`${variant.label}-${index}`}><div className="variant-heading"><strong>{variant.label || `Variant ${index + 1}`}</strong><select className="status-select" value={variant.status} onChange={(event) => updateVariant(index, { status: event.target.value as CreateVariant["status"] })}><option value="draft">Draft</option><option value="needs-edit">Needs edit</option><option value="approved">Approved</option></select></div><div className="variant-meta"><input value={variant.label} onChange={(event) => updateVariant(index, { label: event.target.value })} placeholder="Variant label" /><input value={variant.platform} onChange={(event) => updateVariant(index, { platform: event.target.value })} placeholder="Platform" /></div><label>Title<input value={variant.title} onChange={(event) => updateVariant(index, { title: event.target.value })} placeholder="A clear, specific title" /></label><label>Subtitle / hook<input value={variant.subtitle} onChange={(event) => updateVariant(index, { subtitle: event.target.value })} placeholder="The next line people should understand" /></label><label>Description<textarea value={variant.description} onChange={(event) => updateVariant(index, { description: event.target.value })} placeholder="Reviewable copy direction" rows={4} /></label></article>)}</div> : <div className="empty-create">Build with AI after completing the research foundation.</div>}</div><div className="create-card"><div className="create-card-heading"><div><p className="eyebrow">Answer-engine blocks</p><h3>Prepare useful, factual answers</h3></div><span className="product-count">{create.answerBlocks.length} blocks</span></div>{create.answerBlocks.length ? <div className="answer-list">{create.answerBlocks.map((block, index) => <article className="answer-block" key={`${block.question}-${index}`}><div className="answer-heading"><span>Q{index + 1}</span><select className="status-select" value={block.status} onChange={(event) => updateAnswer(index, { status: event.target.value as AnswerBlock["status"] })}><option value="draft">Draft</option><option value="needs-edit">Needs edit</option><option value="approved">Approved</option></select></div><label>Question<input value={block.question} onChange={(event) => updateAnswer(index, { question: event.target.value })} placeholder="What might someone ask about this product?" /></label><label>Answer<textarea value={block.answer} onChange={(event) => updateAnswer(index, { answer: event.target.value })} placeholder="A concise answer grounded in what you know" rows={4} /></label></article>)}</div> : <div className="empty-create">AI will turn the foundation into concise answer blocks.</div>}</div><div className="create-grid"><div className="create-card"><div className="create-card-heading"><div><p className="eyebrow">Promo brief</p><h3>Give campaigns a usable angle</h3></div></div><div className="promo-grid"><label>Theme<input value={create.promoBrief.theme} onChange={(event) => updatePromo({ theme: event.target.value })} placeholder="Campaign idea" /></label><label>CTA<input value={create.promoBrief.cta} onChange={(event) => updatePromo({ cta: event.target.value })} placeholder="Try it, explore it, learn more" /></label></div><label>Hook<input value={create.promoBrief.hook} onChange={(event) => updatePromo({ hook: event.target.value })} placeholder="The first line that earns attention" /></label><label>Body<textarea value={create.promoBrief.body} onChange={(event) => updatePromo({ body: event.target.value })} placeholder="Short promo direction" rows={4} /></label><label>Channels<input value={create.promoBrief.channels.join(", ")} onChange={(event) => updatePromo({ channels: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Google Play, App Store, social" /></label></div><div className="create-card"><div className="create-card-heading"><div><p className="eyebrow">Creative direction</p><h3>Make the idea easy to produce</h3></div></div><label>Concept<input value={create.creativeBrief.concept} onChange={(event) => updateCreative({ concept: event.target.value })} placeholder="The visual idea" /></label><label>Visual direction<textarea value={create.creativeBrief.visualDirection} onChange={(event) => updateCreative({ visualDirection: event.target.value })} placeholder="Mood, composition, motion, or framing" rows={3} /></label><label>Frames / moments<span className="field-help">One idea per line.</span><textarea value={create.creativeBrief.frames.join("\n")} onChange={(event) => updateCreative({ frames: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} placeholder="Opening frame\nProduct moment\nClosing frame" rows={4} /></label><label>Proof to show<span className="field-help">Only evidence that can be verified.</span><textarea value={create.creativeBrief.proofToShow.join("\n")} onChange={(event) => updateCreative({ proofToShow: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} placeholder="Real feature, review, result, or fact" rows={4} /></label></div></div><div className="research-actions"><span>Everything stays editable. Nothing publishes automatically.</span><div className="workflow-action-buttons"><button className="secondary-button" type="submit" disabled={saving || generating}>Save creation brief</button><button className="primary-button" type="button" onClick={onSaveAndContinue} disabled={!canContinue || saving || generating} aria-describedby={!canContinue ? "create-continue-help" : undefined}>{saving ? "Saving…" : "Save & continue to Promo Events →"}</button></div></div>{!canContinue && <p className="workflow-action-help" id="create-continue-help">Add a primary message before continuing to Promo Events.</p>}</form>}</section>;
}

function CalendarView({ products, events, draft, loading, saving, generating, editorOpen, onNew, onSelect, onChange, onSave, onReschedule, onClose, onGenerateStrategy, onGenerateChannel, onExport, onDelete }: { products: Product[]; events: PromoEvent[]; draft: PromoEvent; loading: boolean; saving: boolean; generating: boolean; editorOpen: boolean; onNew: (date?: string) => void; onSelect: (event: PromoEvent) => void; onChange: (event: PromoEvent) => void; onSave: (event: PromoEvent, quiet?: boolean) => Promise<PromoEvent | null>; onReschedule: (event: PromoEvent, startDate: string, endDate: string) => void; onClose: () => void; onGenerateStrategy: (event: PromoEvent) => void; onGenerateChannel: (event: PromoEvent, channel: PromoChannel, locale?: "en" | "ar") => void; onExport: (event: PromoEvent) => void; onDelete: (event: PromoEvent) => void }) {
  const studioRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<PromoStageKey>("plan");
  const briefFields: Array<[keyof PromoEvent["eventBrief"], string]> = [["whatNew", "What is new?"], ["userValue", "Why should people care?"], ["participation", "How do people participate?"], ["requirements", "Requirements"], ["rewards", "Rewards or unlocks"], ["content", "Content to reveal"], ["missions", "Missions or actions"], ["bonuses", "Bonuses"], ["notes", "Notes for review"]];
  const selectedOption = draft.googlePlay.selectedOption ?? 0;
  const options = draft.googlePlay.options?.length ? draft.googlePlay.options : [{ tagline: draft.googlePlay.tagline ?? "", description: draft.googlePlay.description ?? "" }];
  const dateError = draft.startDate && draft.endDate && draft.endDate < draft.startDate ? "End date must be on or after the start date." : "";
  const stageHasDraft = promoEventStageDrafts(draft);
  const hasStrategy = stageHasDraft.plan;
  const hasGoogle = stageHasDraft.google;
  const hasApple = stageHasDraft.apple;
  const hasSite = stageHasDraft.site;
  const hasCreative = stageHasDraft.creative;
  const english = selectedPromoCopy(draft);
  const localizations = [draft.localization.find((item) => item.locale === "ar") ?? { locale: "ar", tagline: "", description: "", status: "draft" }];
  const hasEnglish = Boolean(english.tagline?.trim() && english.description?.trim());
  const hasEventBasics = products.some((product) => product.id === draft.productId) && Boolean(draft.title.trim()) && !dateError;
  const reviewErrors = promoReviewErrors(draft);
  const savedEvent = events.find((event) => event.id === draft.id);
  const dirty = !savedEvent || JSON.stringify(savedEvent) !== JSON.stringify(draft);
  useEffect(() => {
    if (!editorOpen || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editorOpen, dirty]);
  function closeEditor() {
    if (saving || generating) return;
    if (dirty && !window.confirm("Leave this event without saving your latest edits?")) return;
    onClose();
  }
  const productName = (productId: number) => products.find((product) => product.id === productId)?.name ?? "Choose a product";
  function openStudio() {
    setTab("plan");
    window.setTimeout(() => studioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }
  const listValue = (value: string[] | string | undefined, separator = ", ") => Array.isArray(value) ? value.join(separator) : value ?? "";
  const creativePrompt = draft.creative?.prompt?.toLowerCase() ?? "";
  const creativeProof = Array.isArray(draft.creative?.proofToShow) ? draft.creative.proofToShow : typeof draft.creative?.proofToShow === "string" ? draft.creative.proofToShow.split("\n").map((item) => item.trim()).filter(Boolean) : [];
  const creativeChecks: ValidationCheck[] = [
    { label: "Concept", detail: "Define the visual idea for the event.", valid: Boolean(draft.creative?.concept?.trim()) },
    { label: "Visual direction", detail: "Describe the subject, mood, composition, and product moment.", valid: Boolean(draft.creative?.prompt?.trim()) },
    { label: "Dimensions", detail: "Record the target artwork size or aspect ratio.", valid: Boolean(draft.creative?.dimensions?.trim()) },
    { label: "Safe areas", detail: "Keep critical artwork inside safe zones and away from crop zones.", valid: Boolean(draft.creative?.safeAreas?.trim() && hasCropSafeAreaGuidance(draft.creative.safeAreas)) },
    { label: "Verifiable proof", detail: "Add at least one real feature, reward, or event detail.", valid: creativeProof.length > 0 },
    { label: "No text, logos, slogans, or event typography", detail: "State each restriction explicitly in the prompt.", valid: ["no embedded text", "no logos", "no slogans", "no event-name typography"].every((rule) => creativePrompt.includes(rule)) },
    { label: "No CTA artwork", detail: "Exclude CTA text, buttons, and CTA-like graphics.", valid: ["no cta text", "no buttons", "no cta-like graphics"].every((rule) => creativePrompt.includes(rule)) },
    { label: "Crop-safe composition", detail: "Keep critical artwork inside safe zones and away from crop zones.", valid: creativePrompt.includes("keep critical artwork inside safe zones and away from crop zones") },
  ];
  const activeStageIndex = promoStages.findIndex((stage) => stage.id === tab);
  const nextStage = activeStageIndex >= 0 ? promoStages[activeStageIndex + 1] : undefined;
  const stageContinueHelp = saving
    ? "Wait for the event save to finish."
    : generating
      ? "Wait for the current draft to finish generating."
      : !products.some((product) => product.id === draft.productId)
        ? "Choose a product before moving through the event steps."
        : !draft.title.trim()
          ? "Add an event name before saving and continuing."
          : dateError
            ? "Fix the event date range above before continuing."
            : "";

  async function saveAndAdvance() {
    if (!nextStage) return;
    const saved = await onSave(draft, true);
    if (saved) setTab(nextStage.id);
  }

  function update(next: Partial<PromoEvent>) { onChange({ ...draft, ...next }); }
  function updateBrief(key: string, value: string) { update({ eventBrief: { ...draft.eventBrief, [key]: value } }); }
  function updateGoogle(next: Partial<PromoEvent["googlePlay"]>) { update({ googlePlay: { ...draft.googlePlay, ...next } }); }
  function updateOption(index: number, next: Partial<PromoOption>) { updateGoogle({ options: options.map((option, optionIndex) => optionIndex === index ? { ...option, ...next } : option) }); }
  function updateLocale(localeCode: "en" | "ar", next: Partial<PromoLocale>) {
    const current = draft.localization.find((locale) => locale.locale === localeCode) ?? { locale: localeCode, tagline: "", description: "", status: "draft" };
    const localeOrder = (locale: PromoLocale) => locale.locale === "en" ? 0 : locale.locale === "ar" ? 1 : 2;
    const localization = [...draft.localization.filter((locale) => locale.locale !== localeCode), { ...current, ...next, ...(next.status === "ready" ? { sourceTagline: english.tagline, sourceDescription: english.description } : {}), ...(("tagline" in next || "description" in next) ? { status: "draft" } : {}), locale: localeCode }].sort((left, right) => localeOrder(left) - localeOrder(right));
    update({ localization });
  }
  function updateSite(next: Partial<PromoEvent["siteEntry"]>) { update({ siteEntry: { ...draft.siteEntry, ...next } }); }
  function updateCreative(next: Partial<PromoEvent["creative"]>) { update({ creative: { ...draft.creative, ...next } }); }
  function channelAction(channel: PromoChannel, hasDraft: boolean, label: string, locale?: "en" | "ar") {
    const blockedArabic = channel === "localization" && locale === "ar" && !hasEnglish;
    const disabledReason = generating ? "A draft is generating. Wait for it to finish." : saving ? "The event is saving. Wait for it to finish." : blockedArabic ? "Choose an English draft in Google Play first." : !draft.eventBrief.whatNew?.trim() ? "Describe what is happening in Details first." : "";
    const reasonId = `channel-action-${channel}-${locale ?? "default"}-reason`;
    return <span className="channel-action-control"><AiActionButton label={`${hasDraft ? "Regenerate" : "Generate"} ${label}`} generating={generating} onClick={() => onGenerateChannel(draft, channel, locale)} disabled={Boolean(disabledReason)} title={disabledReason || undefined} describedBy={disabledReason ? reasonId : undefined} />{disabledReason && <small className="channel-action-reason" id={reasonId}>{disabledReason}</small>}</span>;
  }

  return <section className={`calendar-view ${editorOpen ? "promotion-editor-open" : ""}`}>
    {!editorOpen && <div className="section-intro calendar-intro"><div><p className="eyebrow">Promo events calendar</p><h2>Plan what’s coming next</h2><p>See promotions by month or week. Open a date for its agenda, then add, edit, or move an event.</p></div><button className="primary-button" type="button" onClick={() => { onNew(); openStudio(); }}>＋ New event</button></div>}
    {editorOpen && <div className="promotion-backbar"><button type="button" className="secondary-button" onClick={closeEditor} disabled={saving || generating}>← Calendar</button><span>{dirty ? "Unsaved changes" : "All changes saved"} · Nothing is submitted automatically</span></div>}
    <div className="calendar-layout">
      <div className="calendar-list-panel" hidden={editorOpen}>
      <PromoCalendarGrid
        events={events}
        products={products}
        selectedEventId={draft.id}
        loading={loading}
        onSelect={(event) => {
          if (event.isExample && event.startDate) {
            const exampleDraft = createBlankPromoEvent(event.productId || products[0]?.id || 0);
            onChange({ ...exampleDraft, title: event.title, eventType: event.eventType, startDate: event.startDate, endDate: event.endDate || event.startDate });
            openStudio();
            return;
          }
          const selected = events.find((item) => item.id === event.id);
          if (selected) {
            onSelect(selected);
            openStudio();
          }
        }}
        onNew={(date) => { onNew(date); openStudio(); }}
        onReschedule={(event, startDate, endDate) => {
          const selected = event.id ? events.find((item) => item.id === event.id) : undefined;
          if (selected) onReschedule(selected, startDate, endDate);
        }}
      />
    </div>
      <div className={editorOpen ? "calendar-studio" : "calendar-studio calendar-studio-closed"} ref={studioRef}>{!editorOpen ? <div className="calendar-empty studio-empty"><span className="empty-orbit">✦</span><strong>Your event editor is ready when you are</strong><p>Open a date, select a promotion, or start a new event. Your schedule stays clear until then.</p></div> : !draft.productId ? <div className="calendar-empty studio-empty"><span className="empty-orbit">✦</span><strong>Select an event or create one</strong><p>Your event studio will hold the complete promotion package.</p><button className="primary-button" type="button" onClick={() => { onNew(); openStudio(); }}>＋ New event</button></div> : <>
        <div className="event-studio-heading"><div><p className="eyebrow">Event studio</p><h3>{draft.title || "Untitled promo event"}</h3><span>{productName(draft.productId)} · {draft.startDate || "Choose dates"}{draft.endDate && draft.endDate !== draft.startDate ? ` – ${draft.endDate}` : ""}</span></div><div className="calendar-actions"><button className="secondary-button" type="button" onClick={() => setTab("review")} disabled={saving || generating}>Review package</button>{draft.id && <button className="danger-button" type="button" disabled={saving || generating} onClick={() => onDelete(draft)}>Delete</button>}</div></div>
        <form className="event-form" onSubmit={(event) => { event.preventDefault(); void onSave(draft); }}><fieldset disabled={saving || generating} className="promotion-fields">
          <nav className="promotion-tabs" aria-label="Event sections">{promoStages.map((stage) => <button type="button" key={stage.id} className={tab === stage.id ? "active" : ""} onClick={() => setTab(stage.id)} aria-current={tab === stage.id ? "page" : undefined}>{stage.label}</button>)}<select aria-label="Optional channels" value={tab === "apple" || tab === "site" ? tab : ""} onChange={(event) => { if (event.target.value) setTab(event.target.value as PromoStageKey); }}><option value="">Optional channels</option><option value="apple">Apple event{hasApple ? " · draft" : ""}</option><option value="site">Website content{hasSite ? " · draft" : ""}</option></select></nav>
<div className="event-card" hidden={tab !== "plan"}><div className="event-fields"><label>Product<select value={draft.productId} onChange={(event) => update({ productId: Number(event.target.value) })}><option value={0}>Choose a product</option>{products.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label><label>Event name<span className="field-help">Required before AI generation. Example: Halloween event.</span><input value={draft.title} onChange={(event) => update({ title: event.target.value })} placeholder="Halloween event" /></label><label>Type<select value={draft.eventType} onChange={(event) => update({ eventType: event.target.value })}><option value="feature">Feature</option><option value="seasonal">Seasonal</option><option value="liveops">LiveOps</option><option value="offer">Offer</option><option value="content">Content</option></select></label><label>Status<select value={draft.status} onChange={(event) => update({ status: event.target.value })}><option value="planned">Planned</option><option value="in-progress">In progress</option><option value="ready">Prepared for handoff</option><option value="live">Live (manually confirmed)</option></select></label><label>Start date<input type="date" value={draft.startDate} onChange={(event) => update({ startDate: event.target.value })} /></label><label>End date<input type="date" value={draft.endDate} onChange={(event) => update({ endDate: event.target.value })} /></label><label>Theme<input value={draft.theme} onChange={(event) => update({ theme: event.target.value })} placeholder="The central idea" /></label><label>Objective<input value={draft.objective} onChange={(event) => update({ objective: event.target.value })} placeholder="What should this event achieve?" /></label></div>{dateError && <p className="date-error" role="alert">{dateError}</p>}</div>
          {tab === "plan" && <><div className="event-plan-heading"><div><p className="eyebrow">Event strategy</p><h3>What is happening?</h3><span>Describe the real event. AI can help organize your details; missing facts stay flagged for review.</span></div><AiActionButton label={hasStrategy ? "Refine event details" : "Help draft event details"} generating={generating} onClick={() => onGenerateStrategy(draft)} disabled={saving || !draft.title.trim() || !draft.productId || Boolean(dateError)} /></div><div className="event-output-grid">{briefFields.slice(0, 3).map(([key, label]) => <label className="event-card" key={key}>{label}<textarea value={draft.eventBrief[key] ?? ""} onChange={(event) => updateBrief(key, event.target.value)} rows={key === "notes" ? 3 : 4} placeholder={key === "whatNew" ? "Describe the real feature, activity or offer. What will users experience?" : "Add confirmed details, or leave blank if not applicable."} /></label>)}</div><details className="event-card"><summary>Additional details · requirements, rewards and notes</summary><div className="event-output-grid">{briefFields.slice(3).map(([key, label]) => <label key={key}>{label}<textarea value={draft.eventBrief[key] ?? ""} onChange={(event) => updateBrief(key, event.target.value)} rows={3} placeholder="Optional — use confirmed facts only." /></label>)}</div></details></>}
          {tab === "google" && <><div className="event-card"><div className="event-card-heading channel-heading"><div><p className="eyebrow">Google Play Promo Event</p><h3>Choose the copy for this event</h3><span>Write your copy or ask AI for alternatives. Tagline ≤80 · Description ≤500</span></div>{channelAction("googlePlay", hasGoogle, "Google Play draft")}</div><div className="option-list">{options.map((option, index) => <div className={`option-card ${selectedOption === index ? "selected" : ""}`} key={index}><div className="option-card-heading"><strong>Option {index + 1}</strong><label className="option-radio"><input type="radio" name="selected-option" checked={selectedOption === index} onChange={() => updateGoogle({ selectedOption: index })} /> Use this</label></div><label>Tagline<input value={option.tagline} onChange={(event) => updateOption(index, { tagline: event.target.value })} placeholder="Short event hook" aria-describedby={"promo-google-tagline-count-" + index} /><CharacterCounter id={"promo-google-tagline-count-" + index} value={option.tagline} limit={80} /></label><label>Description<textarea value={option.description} onChange={(event) => updateOption(index, { description: event.target.value })} rows={4} placeholder="What is happening and why should people join?" aria-describedby={"promo-google-description-count-" + index} /><CharacterCounter id={"promo-google-description-count-" + index} value={option.description} limit={500} /></label></div>)}</div></div></>}
          {tab === "localization" && <div className="event-card localization-stage"><div className="event-card-heading"><div><p className="eyebrow">Localization</p><h3>Translate your selected Google Play copy</h3><span>English comes directly from your selected Google Play option. No second English draft is needed.</span></div><span>Arabic</span></div><div className="promotion-source"><strong>English source</strong><h4>{english.tagline || "Select an English option in Google Play"}</h4><p>{english.description}</p></div><div className="localization-grid">{localizations.map((locale) => <div className="locale-row" key={locale.locale}><div className="locale-controls"><strong>{locale.locale === "en" ? "English" : "Arabic"}</strong>{locale.tagline && (locale.sourceTagline !== english.tagline || locale.sourceDescription !== english.description) && <small>Review against current English</small>}{channelAction("localization", Boolean(locale.tagline.trim() && locale.description.trim()), `${locale.locale === "en" ? "English" : "Arabic"} draft`, locale.locale as "en" | "ar")}</div><label>Tagline<input value={locale.tagline} onChange={(event) => updateLocale(locale.locale as "en" | "ar", { tagline: event.target.value })} placeholder={`${locale.locale === "en" ? "English" : "Arabic"} tagline`} aria-describedby={"promo-" + locale.locale + "-tagline-count"} /><CharacterCounter id={"promo-" + locale.locale + "-tagline-count"} value={locale.tagline} limit={80} /></label><label>Description<textarea value={locale.description} onChange={(event) => updateLocale(locale.locale as "en" | "ar", { description: event.target.value })} rows={3} placeholder="Localized event description" aria-describedby={"promo-" + locale.locale + "-description-count"} /><CharacterCounter id={"promo-" + locale.locale + "-description-count"} value={locale.description} limit={500} /></label><label>Review status<select value={locale.status} onChange={(event) => updateLocale(locale.locale as "en" | "ar", { status: event.target.value })}><option value="draft">Draft</option><option value="review">In review</option><option value="ready">Ready</option></select></label><button type="button" className="secondary-button" disabled={!locale.tagline.trim() || !locale.description.trim() || !hasEnglish} onClick={() => updateLocale(locale.locale as "en" | "ar", { status: "ready" })}>Mark reviewed against current English</button></div>)}<p className="field-help locale-order-note">Translation uses the selected English option. Review again whenever the English copy changes.</p></div></div>}
          {tab === "apple" && <div className="event-card"><div className="event-card-heading channel-heading"><div><p className="eyebrow">Apple In-App Event</p><h3>Adapt the same moment for Apple</h3><span>Name ≤30 · subtitle ≤50 · description ≤120</span></div>{channelAction("appleEvent", hasApple, "Apple draft")}</div><label>Event name<input value={draft.appleEvent.name ?? ""} onChange={(event) => update({ appleEvent: { ...draft.appleEvent, name: event.target.value } })} placeholder="Name shown in the App Store" aria-describedby="promo-apple-name-count" /><CharacterCounter id="promo-apple-name-count" value={draft.appleEvent.name ?? ""} limit={30} /></label><label>Short description<input value={draft.appleEvent.subtitle ?? ""} onChange={(event) => update({ appleEvent: { ...draft.appleEvent, subtitle: event.target.value } })} placeholder="A concise reason to open the event" aria-describedby="promo-apple-subtitle-count" /><CharacterCounter id="promo-apple-subtitle-count" value={draft.appleEvent.subtitle ?? ""} limit={50} /></label><label>Long description<textarea value={draft.appleEvent.description ?? ""} onChange={(event) => update({ appleEvent: { ...draft.appleEvent, description: event.target.value } })} rows={7} placeholder="Explain the event, value, timing, and participation." aria-describedby="promo-apple-description-count" /><CharacterCounter id="promo-apple-description-count" value={draft.appleEvent.description ?? ""} limit={120} /></label></div>}
          {tab === "site" && <div className="event-card"><div className="event-card-heading channel-heading"><div><p className="eyebrow">AEO / SEO site entry</p><h3>Give the event a searchable home</h3><span>Blog post or landing entry · factual and editable</span></div>{channelAction("siteEntry", hasSite, "site draft")}</div><label>Headline<input value={draft.siteEntry.headline ?? ""} onChange={(event) => updateSite({ headline: event.target.value })} placeholder="A useful, specific headline" /></label><div className="event-form-grid"><label>Slug<input value={draft.siteEntry.slug ?? ""} onChange={(event) => updateSite({ slug: event.target.value })} placeholder="event-slug" /></label><label>CTA<input value={draft.siteEntry.cta ?? ""} onChange={(event) => updateSite({ cta: event.target.value })} placeholder="Explore the event" /></label></div><label>Excerpt<textarea value={draft.siteEntry.excerpt ?? ""} onChange={(event) => updateSite({ excerpt: event.target.value })} rows={3} placeholder="A concise search and answer-engine summary" /></label><label>Body<textarea value={draft.siteEntry.body ?? ""} onChange={(event) => updateSite({ body: event.target.value })} rows={10} placeholder="A factual, useful article or site entry." /></label><label>Keywords<span className="field-help">Separate with commas.</span><input value={listValue(draft.siteEntry.keywords)} onChange={(event) => updateSite({ keywords: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="event keyword, product keyword, seasonal keyword" /></label></div>}
          {tab === "creative" && <><ValidationSummary checks={creativeChecks} title="Creative readiness" /><div className="event-card"><div className="event-card-heading channel-heading"><div><p className="eyebrow">Creative handoff</p><h3>Prepare your artwork brief</h3><span>Production guidance — this does not generate or upload an image.</span></div>{channelAction("creative", hasCreative, "creative brief")}</div><p className="field-help creative-rule-note">Use only verified product and event details. Keep critical artwork inside safe zones and away from crop zones. The artwork must contain no embedded text, logos, slogans, event-name typography, CTA text, buttons, or CTA-like graphics.</p><label>Concept<input value={draft.creative.concept ?? ""} onChange={(event) => updateCreative({ concept: event.target.value })} placeholder="The visual idea" /></label><label>Prompt / visual direction<span className="field-help">Include the subject, environment, mood, lighting, composition, safe-zone sentence, and every required no-text, no-logo, no-slogan, no-event-typography, and no-CTA rule.</span><textarea value={draft.creative.prompt ?? ""} onChange={(event) => updateCreative({ prompt: event.target.value })} rows={6} placeholder="Describe the composition, mood, motion, and product moment. Include every explicit safety rule and the exact safe-zone sentence." /></label><div className="event-form-grid"><label>Dimensions<input value={draft.creative.dimensions ?? ""} onChange={(event) => updateCreative({ dimensions: event.target.value })} placeholder="e.g. 1024×500, 1200×628, 9:16" /></label><label>Safe areas<span className="field-help">Use this exact guidance: Keep critical artwork inside safe zones and away from crop zones.</span><input value={draft.creative.safeAreas ?? ""} onChange={(event) => updateCreative({ safeAreas: event.target.value })} placeholder="Keep critical artwork inside safe zones and away from crop zones" /></label></div><label>Proof to show<span className="field-help">One verifiable feature, reward, or event detail per line.</span><textarea value={listValue(draft.creative.proofToShow, "\n")} onChange={(event) => updateCreative({ proofToShow: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} rows={5} placeholder="Real feature\nReal reward\nReal event timing" /></label></div></>}
          {tab === "review" && <div className="promotion-review">
            <div className="event-card"><p className="eyebrow">Package review</p><h3>{reviewErrors.length ? "A few details need attention" : "Copy is prepared for handoff"}</h3><p>Delivery: {draft.status === "live" ? "Marked live by you — not verified with Google Play." : "Not submitted by Sorted. Complete submission in Play Console."}</p>{reviewErrors.length > 0 && <ul>{reviewErrors.map((error) => <li key={error}>{error}</li>)}</ul>}<p>Artwork, countries, audience and eligibility must still be checked in Play Console.</p></div>
            <div className="event-card"><p className="eyebrow">Selected Google Play content</p><h3>{english.tagline || "No tagline yet"}</h3><p>{english.description || "No description yet"}</p><small>{draft.startDate || "Unscheduled"} — {draft.endDate || "Unscheduled"} · {productName(draft.productId)}</small></div>
            {draft.localization.filter((locale) => locale.locale !== "en" && (locale.tagline || locale.description)).map((locale) => <div className="event-card" key={locale.locale} dir={locale.locale === "ar" ? "rtl" : undefined}><p className="eyebrow">{locale.locale} · {locale.status}</p><h3>{locale.tagline}</h3><p>{locale.description}</p></div>)}
            <GooglePlayPromoHandoff event={draft} product={products.find((item) => item.id === draft.productId)} />
            <button type="button" className="secondary-button" onClick={() => onExport(draft)}>Download {reviewErrors.length ? "draft" : "reviewed"} package</button>
          </div>}
          </fieldset>
          <div className="research-actions promotion-savebar"><span>{saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved"} · Saving does not publish this event.</span><div className="workflow-action-buttons"><button className="secondary-button" type="submit" disabled={saving || generating || !hasEventBasics}>{saving ? "Saving…" : "Save event"}</button>{nextStage ? <button className="primary-button" type="button" onClick={() => void saveAndAdvance()} disabled={!hasEventBasics || saving || generating}>Save & continue →</button> : tab !== "review" ? <button className="primary-button" type="button" onClick={() => setTab("review")}>Review package →</button> : <button className="primary-button" type="button" disabled={!hasEventBasics || saving || generating} onClick={async () => { if (await onSave(draft)) onClose(); }}>Save & return to calendar</button>}</div></div>{(!hasEventBasics || saving || generating) && <p className="workflow-action-help">{stageContinueHelp}</p>}

        </form>
      </>}</div>
    </div>
  </section>;
}

function GooglePlayPromoHandoff({ event, product }: { event: PromoEvent; product?: Product }) {
  const [message, setMessage] = useState("");
  const selected = selectedPromoCopy(event);
  const issues = promoReviewErrors(event);
  const packageName = (() => { try { return product?.url ? new URL(product.url).searchParams.get("id") ?? "" : ""; } catch { return ""; } })();
  const localizations = (event.localization ?? []).filter((item) => item.locale !== "en" && (item.tagline || item.description));
  const eventPacket = [
    issues.length ? "DRAFT — resolve review issues before submission" : "Prepared copy — review artwork and eligibility in Play Console",
    ...issues.map((issue) => `Review: ${issue}`),
    `Product: ${product?.name ?? ""}`,
    packageName ? `Android package: ${packageName}` : "",
    `Event name: ${event.title}`,
    `Event type: ${event.eventType}`,
    `Start date: ${event.startDate}`,
    `End date: ${event.endDate}`,
    `Tagline: ${selected.tagline}`,
    `Description: ${selected.description}`,
    ...localizations.flatMap((item) => [`${item.locale} tagline: ${item.tagline}`, `${item.locale} description: ${item.description}`]),
    "In Play Console, confirm countries, audience, event artwork, preview settings, and featuring request before submission.",
  ].filter(Boolean).join("\n");

  async function copyEventPacket() {
    try {
      await navigator.clipboard.writeText(eventPacket);
      setMessage("Event details copied. Review the dates, countries, artwork, and eligibility in Play Console before submitting.");
    } catch {
      setMessage("Clipboard access is unavailable here. Open Play Console and copy the event fields manually from this draft.");
    }
  }

  return <aside className="play-console-handoff" aria-label="Google Play promotional content handoff">
    <div><p className="eyebrow">Publishing handoff</p><strong>Promotional Content still needs Play Console</strong><p>Google’s public Android Publisher API does not currently expose event creation or submission. Copy this draft, then finish countries, artwork, and review in Play Console. Google recommends submitting at least four days before an event.</p></div>
    <div className="play-console-actions"><button type="button" className="secondary-button" onClick={() => void copyEventPacket()}>{issues.length ? "Copy draft with review notes" : "Copy event details"}</button><a className="primary-button" href="https://play.google.com/console" target="_blank" rel="noreferrer">Open Play Console ↗</a></div>
    {message && <p className="play-console-message" role="status">{message}</p>}
  </aside>;
}

function GooglePlayConnectionView({ product, connection, oauthConnection, loading, syncing, connectingOAuth, onConnectOAuth, onSync, onDisconnect, onBack }: { product: Product; connection: GooglePlayConnection | null; oauthConnection: GooglePlayOAuthConnection | null; loading: boolean; syncing: boolean; connectingOAuth: boolean; onConnectOAuth: (payload: { packageName: string; locale: string; label: string }) => void; onSync: () => Promise<void>; onDisconnect: () => Promise<void>; onBack: () => void }) {
  const inferredPackageName = useMemo(() => {
    try {
      return new URL(product.url).searchParams.get("id") ?? "";
    } catch {
      return "";
    }
  }, [product.url]);
  const [packageName, setPackageName] = useState(connection?.packageName ?? inferredPackageName);
  const [locale, setLocale] = useState(connection?.locale ?? "en-US");
  const connected = connection?.status === "connected";
  const oauthConnected = oauthConnection?.status === "connected";
  const hasAuthenticatedConnection = connected || oauthConnected;
  const connectionLabel = connection?.label ?? `${product.name} Google Play`;
  const statusLabel = oauthConnection?.status === "error" || connection?.status === "error" ? "Needs attention" : hasAuthenticatedConnection ? oauthConnected ? "Google account connected" : "Connected" : connection?.status === "testing" ? "Testing" : "Not connected";

  return <section className="connection-view"><div className="research-toolbar"><button className="back-button" type="button" onClick={onBack}>← {product.name}</button><span>{hasAuthenticatedConnection ? "Google Play connected" : "Store connection"}</span></div><div className="research-layout"><div className="research-main"><div className="section-intro"><div><p className="eyebrow">Product connection</p><h2>Connect Google Play</h2><p>Bring the authenticated listing for {product.name} into Sorted so Optimize works from the data you control in Play Console.</p></div><span className={`connection-status ${oauthConnected ? "connected" : connection?.status ?? "disconnected"}`}>{statusLabel}</span></div>{loading ? <div className="loading-line">Loading the connection…</div> : <><div className="oauth-connect-card"><div><p className="eyebrow">Google account</p><h3>{oauthConnected ? "Google account connected" : "Connect with Google"}</h3><p>{oauthConnected ? `Connected account ${oauthConnection?.accountEmail || "is ready"}. Google authorization is securely managed by Sorted.` : "Sign in with the Google account that manages this app in Play Console. No service-account key or Google Cloud setup is needed."}</p></div><button className="primary-button" type="button" onClick={() => onConnectOAuth({ packageName, locale, label: connectionLabel })} disabled={connectingOAuth || !packageName.trim() || !locale.trim()}>{connectingOAuth ? "Opening Google…" : oauthConnected ? "Reconnect account" : "Connect Google account"}</button></div><div className="research-form"><div className="research-two-col"><label>Android package name<span className="field-help">The application ID from Google Play, for example com.example.app.</span><input value={packageName} onChange={(event) => setPackageName(event.target.value)} placeholder="com.example.app" required /></label><label>Listing language<span className="field-help">The language to import from Play Console, such as en-US.</span><input value={locale} onChange={(event) => setLocale(event.target.value)} placeholder="en-US" required /></label></div></div></>}{(connection?.lastError || oauthConnection?.lastError) && <div className="connection-error" role="alert"><strong>Google Play reported a problem</strong><span>{oauthConnection?.lastError || connection?.lastError}</span></div>}{(connection || oauthConnection) && <div className="connection-actions"><button className="secondary-button" type="button" onClick={() => void onSync()} disabled={syncing || !hasAuthenticatedConnection}>{syncing ? "Syncing listing…" : "Sync authenticated listing"}</button><button className="danger-button" type="button" onClick={() => void onDisconnect()} disabled={syncing}>Disconnect</button></div>}</div><aside className="research-sidebar"><div className="research-side-card"><p className="eyebrow">What this unlocks</p><h3>One trusted store source.</h3><p>Sorted can refresh the title, short description, and full description from the authenticated Google Play listing, while retaining public category and icon context where available.</p><div className="connection-checklist"><span>✓</span><span>Google sign-in; no key setup</span><span>✓</span><span>Read-only listing sync</span><span>✓</span><span>No publish or edit action</span></div></div><div className="research-side-card muted-card"><span className="module-icon">◎</span><h3>Keep your account safe</h3><p>Google handles sign-in and consent. Sorted stores the authorization securely and shows only the connected account.</p></div></aside></div></section>;
}

function ResearchView({ product, research, loading, saving, generating, onChange, onSave, onSaveAndContinue, onGenerate, onBack }: { product: Product; research: ResearchBrief; loading: boolean; saving: boolean; generating: boolean; onChange: (next: ResearchBrief) => void; onSave: (event: FormEvent<HTMLFormElement>) => void; onSaveAndContinue: () => void; onGenerate: () => void; onBack: () => void }) {
  const canContinue = Boolean(research.intent.trim() && research.semanticCore.trim());
  return <section className="research-view"><div className="research-toolbar"><button className="back-button" onClick={onBack}>← {product.name}</button><span>{research.updatedAt ? `Saved ${formatDate(research.updatedAt)}` : "Not saved yet"}</span></div><div className="research-layout"><div className="research-main"><div className="section-intro"><div><p className="eyebrow">Research foundation</p><h2>Make the product easy to understand</h2><p>Capture the language, alternatives, and proof behind {product.name}. This brief will feed ASO, AEO, promo, and publishing work.</p></div><AiActionButton label="Generate research brief" generating={generating} onClick={onGenerate} /></div>{loading ? <div className="loading-line">Loading the research brief…</div> : <form className="research-form" onSubmit={onSave}><label>What are people trying to do?<span className="field-help">The job, problem, or intent that brings them here.</span><textarea value={research.intent} onChange={(event) => onChange({ ...research, intent: event.target.value })} placeholder="Example: quickly play a satisfying stacking game when I have a few minutes" rows={4} /></label><label>Semantic core<span className="field-help">AI will suggest phrases people may use. Review them before publishing.</span><textarea value={research.semanticCore} onChange={(event) => onChange({ ...research, semanticCore: event.target.value })} placeholder="stacking game, relaxing puzzle game, quick mobile game" rows={4} /></label><div className="research-two-col"><label>Alternatives and competitors<span className="field-help">What would someone choose instead?</span><textarea value={research.competitors} onChange={(event) => onChange({ ...research, competitors: event.target.value })} placeholder="Names, categories, or substitutes" rows={4} /></label><label>Proof and evidence<span className="field-help">Reviews, features, results, or facts we can safely use.</span><textarea value={research.proof} onChange={(event) => onChange({ ...research, proof: event.target.value })} placeholder="Real evidence only" rows={4} /></label></div><label>Research notes <span className="optional">optional</span><textarea value={research.notes} onChange={(event) => onChange({ ...research, notes: event.target.value })} placeholder="Anything else future tools should remember" rows={4} /></label><div className="research-actions"><span>AI suggestions stay editable.</span><div className="workflow-action-buttons"><button className="secondary-button" type="submit" disabled={saving || generating}>Save research brief</button><button className="primary-button" type="button" onClick={onSaveAndContinue} disabled={!canContinue || saving || generating} aria-describedby={!canContinue ? "research-continue-help" : undefined}>{saving ? "Saving…" : "Save & continue to Optimize →"}</button></div></div>{!canContinue && <p className="workflow-action-help" id="research-continue-help">Add both the product intent and semantic core to continue to Optimize.</p>}</form>}</div><aside className="research-sidebar"><div className="research-side-card"><p className="eyebrow">Why this matters</p><h3>One brief. Many outputs.</h3><p>Sorted will use this foundation to keep future copy, keywords, events, and recommendations aligned with the same product truth.</p><div className="research-flow"><span>Research</span><b>→</b><span>Optimize</span><b>→</b><span>Create</span></div></div><div className="research-side-card muted-card"><span className="module-icon">✦</span><h3>Next after this</h3><p>We’ll turn the semantic core into a first optimization workspace for store and answer-engine visibility.</p></div></aside></div></section>;
}

function Metric({ value, label, tone }: { value: string; label: string; tone: string }) { return <div className={`metric ${tone}`}><span className="metric-value">{value}</span><span className="metric-label">{label}</span><span className="metric-dot" /></div>; }
function ProductAvatar({ product, size = "small" }: { product: Product; size?: "small" | "large" }) {
  const primaryIconUrl = product.iconUrl?.trim() ?? "";
  const fallbackIconUrl = getInitialProductIconUrl(product.url);
  const productKey = `${product.id}:${product.url}`;
  const [failedImage, setFailedImage] = useState<{ productKey: string; url: string } | null>(null);
  const hasFailed = (candidate: string) => failedImage?.productKey === productKey && failedImage.url === candidate;
  const iconUrl = [primaryIconUrl, fallbackIconUrl].find((candidate, index, candidates) => candidate && candidates.indexOf(candidate) === index && !hasFailed(candidate)) ?? "";
  const showIcon = Boolean(iconUrl);
  return <span className={(size === "large" ? "product-avatar" : "row-avatar") + (showIcon ? " has-product-icon" : "")} aria-hidden="true">
    {showIcon ? <Image src={iconUrl} alt="" width={size === "large" ? 46 : 34} height={size === "large" ? 46 : 34} unoptimized loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedImage({ productKey, url: iconUrl })} /> : product.name.slice(0, 1).toUpperCase()}
  </span>;
}

function ProductSwitcher({ products, activeProduct, onSelectProduct, onManageProducts, mobile = false }: {
  products: Product[];
  activeProduct: Product | null;
  onSelectProduct: (product: Product | null) => void;
  onManageProducts: () => void;
  mobile?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filteredProducts = products.filter((product) => product.name.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      setQuery("");
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function selectProduct(product: Product | null) {
    setOpen(false);
    setQuery("");
    onSelectProduct(product);
  }

  return <div className={"product-switcher" + (mobile ? " mobile-product-switcher" : "")} ref={rootRef}>
    <p className="product-switcher-label">Workspace scope</p>
    <button type="button" className="product-switcher-trigger" ref={triggerRef} aria-expanded={open} aria-haspopup="dialog" onClick={() => { setOpen((current) => !current); setQuery(""); }}>
      {activeProduct ? <ProductAvatar product={activeProduct} /> : <span className="product-switcher-all-mark" aria-hidden="true">✦</span>}
      <span className="product-switcher-current">
        <strong>{activeProduct?.name ?? "All products"}</strong>
        <small>{activeProduct ? activeProduct.type + " workspace" : "Account workspace"}</small>
      </span>
      <span className="product-switcher-chevron" aria-hidden="true">⌄</span>
    </button>
    {open && <div className="product-switcher-menu" role="dialog" aria-label="Choose a product">
      <div className="product-switcher-menu-heading"><strong>Switch product</strong><span>{products.length} total</span></div>
      <label className="product-switcher-search">
        <span className="sr-only">Search products</span>
        <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a product…" />
      </label>
      <div className="product-switcher-options" role="group" aria-label="Workspace scope">
        <button type="button" aria-pressed={!activeProduct} className={"product-switcher-option" + (!activeProduct ? " selected" : "")} onClick={() => selectProduct(null)}>
          <span className="product-switcher-all-mark small" aria-hidden="true">✦</span>
          <span className="product-switcher-option-copy"><strong>All products</strong><small>Account-wide workspace</small></span>
          {!activeProduct && <span className="product-switcher-check" aria-hidden="true">✓</span>}
        </button>
        {filteredProducts.map((product) => <button type="button" aria-pressed={activeProduct?.id === product.id} className={"product-switcher-option" + (activeProduct?.id === product.id ? " selected" : "")} key={product.id} onClick={() => selectProduct(product)}>
          <ProductAvatar product={product} />
          <span className="product-switcher-option-copy"><strong>{product.name}</strong><small>{product.type}</small></span>
          {activeProduct?.id === product.id && <span className="product-switcher-check" aria-hidden="true">✓</span>}
        </button>)}
        {filteredProducts.length === 0 && <p className="product-switcher-empty">{products.length ? "No products match that search." : "Add a product to start its workspace."}</p>}
      </div>
      <button type="button" className="product-switcher-manage" onClick={() => { setOpen(false); setQuery(""); onManageProducts(); }}>Manage products <span aria-hidden="true">→</span></button>
    </div>}
  </div>;
}

function ProductRow({ product, onClick }: { product: Product; onClick: () => void }) { return <button className="product-row" onClick={onClick}><ProductAvatar product={product} /><span className="row-copy"><strong>{product.name}</strong><small>{product.type} · {product.audience || "Audience not set"}</small></span><span className="row-status">{product.position && product.audience ? "Ready" : "Needs foundation"}</span><span className="row-arrow">→</span></button>; }
function EmptyPortfolio({ onAdd }: { onAdd: () => void }) { return <div className="empty-portfolio"><div className="empty-orbit small">＋</div><div><strong>No products yet</strong><p>Add your first product and Sorted will shape the workspace around it.</p></div><button className="secondary-button" onClick={onAdd}>Add product</button></div>; }
