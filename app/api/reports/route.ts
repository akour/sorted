import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "../../../db";
import { createBriefs, optimizationPlans, products, promoEvents, publishPlans, researchBriefs } from "../../../db/schema";
import { canMarkPublishReady, getPublishReadiness, hasCreateBriefContent } from "../../../lib/publish-readiness";

type StageStatus = "not-started" | "draft" | "needs-review" | "ready";
type WorkflowStage = { key: string; label: string; view: string; status: StageStatus; detail: string };

async function getOwnerId() {
  const requestHeaders = await headers();
  return requestHeaders.get("oai-authenticated-user-id") ?? "local-owner";
}

function parseArray(value: string | undefined) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed as unknown[] : [];
  } catch {
    return [];
  }
}

function parseObject(value: string | undefined) {
  try {
    const parsed = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function containsText(value: unknown): boolean {
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.some(containsText);
  if (value && typeof value === "object") return Object.values(value).some(containsText);
  return false;
}

function hasPublishContent(plan: typeof publishPlans.$inferSelect | undefined) {
  if (!plan) return false;
  const channels = parseArray(plan.channels);
  const checklist = parseArray(plan.checklist);
  const channelContent = channels.some((value) => {
    if (!value || typeof value !== "object") return false;
    const channel = value as Record<string, unknown>;
    return (typeof channel.status === "string" && channel.status !== "draft")
      || containsText(channel.note)
      || containsText(channel.lastExportedAt);
  });
  const completedChecklist = checklist.some((value) => Boolean(value && typeof value === "object" && (value as Record<string, unknown>).done));
  return plan.status === "review" || plan.status === "ready" || plan.status === "published"
    || Boolean(plan.releaseNotes.trim()) || channelContent || completedChecklist;
}

function promoSignals(event: typeof promoEvents.$inferSelect) {
  const eventBrief = parseObject(event.eventBrief);
  const googlePlay = parseObject(event.googlePlay);
  const appleEvent = parseObject(event.appleEvent);
  const siteEntry = parseObject(event.siteEntry);
  const creative = parseObject(event.creative);
  const strategy = Boolean(event.title.trim() || event.theme.trim() || event.objective.trim() || containsText(eventBrief));
  const channels = containsText(googlePlay) || containsText(appleEvent) || containsText(siteEntry) || containsText(creative);
  return { hasWork: strategy || channels, hasChannels: channels, markedReady: event.status === "ready" || event.status === "live" };
}

function buildWorkflow(
  research: typeof researchBriefs.$inferSelect | undefined,
  optimization: typeof optimizationPlans.$inferSelect | undefined,
  create: typeof createBriefs.$inferSelect | undefined,
  publish: typeof publishPlans.$inferSelect | undefined,
  events: Array<typeof promoEvents.$inferSelect>,
) {
  const researchHasContent = Boolean(research && [research.intent, research.semanticCore, research.competitors, research.proof, research.notes].some((value) => value.trim()));
  const researchComplete = Boolean(research?.intent.trim() && research.semanticCore.trim());
  const researchStatus: StageStatus = !researchHasContent ? "not-started" : researchComplete ? "ready" : "draft";
  const researchDetail = researchStatus === "not-started"
    ? "Add the audience intent, semantic core, and product evidence."
    : researchStatus === "ready"
      ? "Intent and semantic core are saved for optimization. Verify evidence before using product claims."
      : "Save the core research fields before building optimization copy.";

  const optimizationFields = [optimization?.storeTitle, optimization?.storeSubtitle, optimization?.storeShortDescription, optimization?.answerSummary];
  const optimizationHasContent = Boolean(optimization && [optimization.storeTitle, optimization.storeSubtitle, optimization.storeShortDescription, optimization.storeLongDescription, optimization.answerSummary].some((value) => value.trim()));
  const optimizationComplete = optimizationFields.every((value) => Boolean(value?.trim()));
  const optimizationLimitsValid = Boolean(optimization)
    && optimization!.storeTitle.trim().length <= 30
    && optimization!.storeSubtitle.trim().length <= 30
    && optimization!.storeShortDescription.trim().length <= 80;
  const optimizationStatus: StageStatus = !optimizationHasContent
    ? "not-started"
    : !optimizationComplete
      ? "draft"
      : optimizationLimitsValid
        ? "ready"
        : "needs-review";
  const optimizationDetail = optimizationStatus === "not-started"
    ? "Use the research foundation to draft store and answer copy."
    : optimizationStatus === "draft"
      ? "Required store or answer fields are still missing."
      : optimizationStatus === "needs-review"
        ? "Review character limits before using this copy downstream."
        : "Required store and answer copy is saved and passes length checks.";

  const createHasContent = hasCreateBriefContent(create);
  const createStatus: StageStatus = !createHasContent
    ? "not-started"
    : create?.status === "approved"
      ? "ready"
      : create?.status === "review"
        ? "needs-review"
        : "draft";
  const createDetail = createStatus === "not-started"
    ? "Create store copy, answer blocks, and creative direction."
    : createStatus === "ready"
      ? "The creation brief is approved and ready for handoff."
      : createStatus === "needs-review"
        ? "The creation brief is marked for review."
        : "A saved creation draft is ready to continue.";

  const promoPackages = events.map(promoSignals).filter((event) => event.hasWork);
  const promoStatus: StageStatus = promoPackages.length === 0
    ? "not-started"
    : promoPackages.every((event) => event.markedReady)
      ? "ready"
      : promoPackages.some((event) => event.hasChannels)
        ? "needs-review"
        : "draft";
  const promoDetail = promoStatus === "not-started"
    ? "Plan a reusable event package for this product."
    : promoStatus === "ready"
      ? "All saved promo events are marked ready or live."
      : promoStatus === "needs-review"
        ? "Channel content is saved; review it before marking the event ready."
        : "A promo plan is saved; continue with its channel packages.";

  const publishHasContent = hasPublishContent(publish);
  const publishReadiness = getPublishReadiness({ research, optimization, create });
  const publishCanBeReady = canMarkPublishReady(publishReadiness, parseArray(publish?.checklist));
  const publishStatus: StageStatus = !publishHasContent
    ? "not-started"
    : publish?.status === "ready" || publish?.status === "published"
      ? publishCanBeReady ? "ready" : "needs-review"
      : publish?.status === "review"
        ? "needs-review"
        : "draft";
  const publishDetail = publishStatus === "not-started"
    ? "Prepare the channel handoff when the core work is ready."
    : publishStatus === "ready"
      ? "The channel handoff is ready for a final manual check."
      : publishStatus === "needs-review"
        ? publish?.status === "review" ? "The handoff is marked for review." : "Complete the source stages and release checklist before marking this handoff ready."
        : "A handoff draft is saved; complete its checks before export.";

  const workflow: WorkflowStage[] = [
    { key: "research", label: "Research", view: "Research", status: researchStatus, detail: researchDetail },
    { key: "optimize", label: "Optimize", view: "Optimize", status: optimizationStatus, detail: optimizationDetail },
    { key: "create", label: "Create", view: "Create", status: createStatus, detail: createDetail },
    { key: "promo", label: "Promo", view: "Calendar", status: promoStatus, detail: promoDetail },
    { key: "publish", label: "Publish", view: "Publish", status: publishStatus, detail: publishDetail },
  ];
  const workflowStartedCount = workflow.filter((stage) => stage.status !== "not-started").length;
  const nextStage = workflow.find((stage) => stage.status !== "ready");
  const nextAction = nextStage
    ? {
      title: nextStage.status === "not-started" ? `Start ${nextStage.label}` : nextStage.status === "draft" ? `Continue ${nextStage.label}` : `Review ${nextStage.label}`,
      buttonLabel: `Open ${nextStage.label}`,
      view: nextStage.view,
      detail: nextStage.detail,
    }
    : {
      title: "Review the handoff",
      buttonLabel: "Open Publish",
      view: "Publish",
      detail: "Every stage is ready. Give the channel packet one final manual check before export.",
    };
  return { workflow, workflowStartedCount, nextAction };
}

export async function GET() {
  try {
    const ownerId = await getOwnerId();
    const db = getDb();
    const [productRows, researchRows, optimizationRows, createRows, publishRows, eventRows] = await Promise.all([
      db.select().from(products).where(eq(products.ownerId, ownerId)).orderBy(desc(products.updatedAt)),
      db.select().from(researchBriefs).where(eq(researchBriefs.ownerId, ownerId)),
      db.select().from(optimizationPlans).where(eq(optimizationPlans.ownerId, ownerId)),
      db.select().from(createBriefs).where(eq(createBriefs.ownerId, ownerId)),
      db.select().from(publishPlans).where(eq(publishPlans.ownerId, ownerId)),
      db.select().from(promoEvents).where(eq(promoEvents.ownerId, ownerId)),
    ]);
    const researchByProduct = new Map(researchRows.map((row) => [row.productId, row]));
    const optimizationByProduct = new Map(optimizationRows.map((row) => [row.productId, row]));
    const createByProduct = new Map(createRows.map((row) => [row.productId, row]));
    const publishByProduct = new Map(publishRows.map((row) => [row.productId, row]));
    const eventsByProduct = new Map<number, Array<typeof promoEvents.$inferSelect>>();
    for (const event of eventRows) eventsByProduct.set(event.productId, [...(eventsByProduct.get(event.productId) ?? []), event]);
    const eventCounts = new Map<number, number>();
    for (const event of eventRows) eventCounts.set(event.productId, (eventCounts.get(event.productId) ?? 0) + 1);

    const reportProducts = productRows.map((product) => {
      const research = researchByProduct.get(product.id);
      const optimization = optimizationByProduct.get(product.id);
      const create = createByProduct.get(product.id);
      const publish = publishByProduct.get(product.id);
      const workflow = buildWorkflow(research, optimization, create, publish, eventsByProduct.get(product.id) ?? []);
      return {
        ...product,
        foundationReady: Boolean(product.position.trim() && product.audience.trim()),
        publishStatus: publish?.status ?? "not started",
        eventCount: eventCounts.get(product.id) ?? 0,
        ...workflow,
      };
    });

    return Response.json({
      mode: "readiness",
      summary: {
        products: reportProducts.length,
        foundationReady: reportProducts.filter((product) => product.foundationReady).length,
        completeWorkspaces: reportProducts.filter((product) => product.workflow.slice(0, 3).every((stage) => stage.status === "ready")).length,
        readyForHandoff: reportProducts.filter((product) => product.workflow.every((stage) => stage.status === "ready")).length,
        promoEvents: eventRows.length,
      },
      products: reportProducts,
    });
  } catch (error) {
    console.error("Reports load failed", error);
    return Response.json({ error: "We could not load the workspace report." }, { status: 500 });
  }
}
