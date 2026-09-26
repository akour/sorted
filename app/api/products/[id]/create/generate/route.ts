import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";
import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../../../db";
import { aiSettings, createBriefs, optimizationPlans, products, researchBriefs } from "../../../../../../db/schema";
import { openCodeWorkspaceRestrictionMessage, requestOpenCodeWithFallback, safeOpenCodeFailureDetails } from "../../../../../../lib/opencode-client";
import { DEFAULT_OPENCODE_MODEL, getOpenCodeModel } from "../../../../../../lib/opencode-models";

function parseFallbacks(value: string | undefined) {
  try {
    const parsed = JSON.parse(value ?? "[]") as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseCreateJson(raw: string) {
  const candidate = raw.match(/\{[\s\S]*\}/)?.[0] ?? raw;
  const parsed = JSON.parse(candidate) as {
    status?: string;
    primaryMessage?: string;
    storeVariants?: Array<Record<string, unknown>>;
    answerBlocks?: Array<Record<string, unknown>>;
    promoBrief?: Record<string, unknown>;
    creativeBrief?: Record<string, unknown>;
  };
  const status = parsed.status === "review" || parsed.status === "approved" ? parsed.status : "draft";
  const variants = Array.isArray(parsed.storeVariants) ? parsed.storeVariants.map((item) => ({
    label: typeof item.label === "string" ? item.label.trim() : "Store listing",
    platform: typeof item.platform === "string" ? item.platform.trim() : "Google Play",
    title: typeof item.title === "string" ? item.title.trim() : "",
    subtitle: typeof item.subtitle === "string" ? item.subtitle.trim() : "",
    description: typeof item.description === "string" ? item.description.trim() : "",
    status: item.status === "needs-edit" || item.status === "approved" ? item.status : "draft",
  })).filter((item) => item.title || item.subtitle || item.description) : [];
  const answers = Array.isArray(parsed.answerBlocks) ? parsed.answerBlocks.map((item) => ({
    question: typeof item.question === "string" ? item.question.trim() : "",
    answer: typeof item.answer === "string" ? item.answer.trim() : "",
    status: item.status === "needs-edit" || item.status === "approved" ? item.status : "draft",
  })).filter((item) => item.question || item.answer) : [];
  const promo = parsed.promoBrief && typeof parsed.promoBrief === "object" ? parsed.promoBrief : {};
  const creative = parsed.creativeBrief && typeof parsed.creativeBrief === "object" ? parsed.creativeBrief : {};
  return {
    status,
    primaryMessage: typeof parsed.primaryMessage === "string" ? parsed.primaryMessage.trim() : "",
    storeVariants: variants,
    answerBlocks: answers,
    promoBrief: {
      theme: typeof promo.theme === "string" ? promo.theme.trim() : "",
      hook: typeof promo.hook === "string" ? promo.hook.trim() : "",
      body: typeof promo.body === "string" ? promo.body.trim() : "",
      cta: typeof promo.cta === "string" ? promo.cta.trim() : "",
      channels: Array.isArray(promo.channels) ? promo.channels.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [],
    },
    creativeBrief: {
      concept: typeof creative.concept === "string" ? creative.concept.trim() : "",
      visualDirection: typeof creative.visualDirection === "string" ? creative.visualDirection.trim() : "",
      frames: Array.isArray(creative.frames) ? creative.frames.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [],
      proofToShow: Array.isArray(creative.proofToShow) ? creative.proofToShow.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [],
    },
  };
}

function serialize(brief: typeof createBriefs.$inferSelect, generated: ReturnType<typeof parseCreateJson>) {
  return { ...brief, ...generated };
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const productId = Number((await context.params).id);
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const db = getDb();
    const [product] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1);
    if (!product) return Response.json({ error: "Product not found." }, { status: 404 });
    const [research] = await db.select().from(researchBriefs).where(and(eq(researchBriefs.productId, productId), eq(researchBriefs.ownerId, ownerId))).limit(1);
    if (!research?.semanticCore) return Response.json({ error: "Complete the research foundation before building creation briefs." }, { status: 400 });
    const [optimization] = await db.select().from(optimizationPlans).where(and(eq(optimizationPlans.productId, productId), eq(optimizationPlans.ownerId, ownerId))).limit(1);
    const apiKey = env.OPENCODE_API_KEY;
    if (!apiKey) return Response.json({ error: "OpenCode is not connected yet. Add an OpenCode API key to Sorted before generating creation briefs." }, { status: 503 });

    const [savedAiSettings] = await db.select().from(aiSettings).where(eq(aiSettings.ownerId, ownerId)).limit(1);
    const configuredModel = savedAiSettings?.activeModel || env.OPENCODE_MODEL || DEFAULT_OPENCODE_MODEL;
    const activeModel = getOpenCodeModel(configuredModel)?.id ?? DEFAULT_OPENCODE_MODEL;
    const candidates = [activeModel, ...parseFallbacks(savedAiSettings?.fallbackModels)].map((id) => getOpenCodeModel(id)?.id).filter((id, index, list): id is string => Boolean(id) && list.indexOf(id) === index);
    const prompt = `Build a first creation brief for this product. Use only the supplied product, research, and optimization facts. Do not invent features, ratings, reviews, outcomes, competitor claims, or audience promises. Do not imply anything is published. Return JSON only with exactly these keys: status, primaryMessage, storeVariants, answerBlocks, promoBrief, creativeBrief. status must be draft. storeVariants must include 3 editable variants with label, platform, title, subtitle, description, status. answerBlocks must include 3 factual question-and-answer blocks with question, answer, status. promoBrief must include theme, hook, body, cta, channels. creativeBrief must include concept, visualDirection, frames (array), proofToShow (array). Keep copy concise, specific, and reviewable. Use only channels that make sense for the supplied product. Do not mention competitor brands unless explicitly provided.

Product
Name: ${product.name}
Type: ${product.type}
Positioning: ${product.position || "not provided"}
Audience: ${product.audience || "not provided"}
Primary link: ${product.url || "not provided"}

Research foundation
Intent: ${research.intent || "not provided"}
Semantic core: ${research.semanticCore}
Alternatives: ${research.competitors || "not provided"}
Proof to verify: ${research.proof || "not provided"}
Notes: ${research.notes || "not provided"}

Optimization direction
Store title: ${optimization?.storeTitle || "not provided"}
Store subtitle: ${optimization?.storeSubtitle || "not provided"}
Short description: ${optimization?.storeShortDescription || "not provided"}
Answer summary: ${optimization?.answerSummary || "not provided"}`;
    const system = "You are a careful organic marketing creative strategist. Output valid JSON only. Do not explain your reasoning; reserve the response for the final JSON object.";
    const generation = await requestOpenCodeWithFallback({ models: candidates, apiKey, baseUrl: env.OPENCODE_BASE_URL, sessionId: `sorted-create-${productId}`, system, prompt, maxTokens: 5000, timeoutMs: 30_000, validate: (text) => { const parsed = parseCreateJson(text); return parsed.primaryMessage && parsed.storeVariants.length && parsed.answerBlocks.length ? parsed : null; } });
    const generated = generation.value;
    const usedModel = generation.model ?? activeModel;
    if (!generated) {
      const detail = safeOpenCodeFailureDetails(generation.failures, apiKey);
      const restrictionMessage = openCodeWorkspaceRestrictionMessage(generation.failures);
      if (restrictionMessage) return Response.json({ error: restrictionMessage, detail }, { status: 502 });
      return Response.json({ error: "OpenCode could not build the creation brief with the configured model or fallbacks.", detail }, { status: 502 });
    }

    const [existing] = await db.select().from(createBriefs).where(and(eq(createBriefs.productId, productId), eq(createBriefs.ownerId, ownerId))).limit(1);
    const values = {
      status: generated.status,
      primaryMessage: generated.primaryMessage,
      storeVariants: JSON.stringify(generated.storeVariants),
      answerBlocks: JSON.stringify(generated.answerBlocks),
      promoBrief: JSON.stringify(generated.promoBrief),
      creativeBrief: JSON.stringify(generated.creativeBrief),
      updatedAt: new Date().toISOString(),
    };
    const [brief] = existing
      ? await db.update(createBriefs).set(values).where(eq(createBriefs.id, existing.id)).returning()
      : await db.insert(createBriefs).values({ productId, ownerId, ...values }).returning();
    return Response.json({ create: serialize(brief, generated), model: usedModel, fallbacksUsed: generation.failures.length });
  } catch (error) {
    console.error("create generation failed", error);
    return Response.json({ error: "The creation request failed. Check the product research and OpenCode configuration." }, { status: 500 });
  }
}
