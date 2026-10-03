import { getOwnerId, ownerAuthenticationRequired } from "@/lib/owner";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { createBriefs, optimizationPlans, products, promoEvents, researchBriefs } from "../../../../db/schema";
import { openCodeWorkspaceRestrictionMessage, requestOpenCode, safeOpenCodeFailureDetails } from "../../../../lib/opencode-client";
import { getOpenCodeModel, getOpenCodeTransport } from "../../../../lib/opencode-models";
import { getGenerationModels, getOpenCodeRuntime } from "../../../../lib/ai-runtime";
import { selectedPromoCopy } from "../../../../lib/promo-review";
import { serializeEvent } from "../route";

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    return JSON.parse(value ?? "") as T;
  } catch {
    return fallback;
  }
}

function compact(value: unknown, limit = 9000) {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function extractJsonObjects(raw: string) {
  const candidates: string[] = [];
  for (let start = raw.indexOf("{"); start >= 0; start = raw.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < raw.length; index += 1) {
      const character = raw[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }
      if (character === '"') {
        inString = true;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          candidates.push(raw.slice(start, index + 1));
          break;
        }
      }
    }
  }
  return candidates.length ? candidates : [raw];
}

function parseRecordJson(raw: string) {
  let parsed: Record<string, unknown> | null = null;
  for (const candidate of extractJsonObjects(raw)) {
    try {
      const value = JSON.parse(candidate) as unknown;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        parsed = value as Record<string, unknown>;
        break;
      }
    } catch {
      // Try the next balanced object in case the model prefixed its answer with text.
    }
  }
  if (!parsed) throw new Error("The model response was not valid JSON.");
  return parsed;
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function parseStrategyJson(raw: string) {
  const parsed = parseRecordJson(raw);
  return {
    title: typeof parsed.title === "string" ? parsed.title.trim() : "",
    eventType: typeof parsed.eventType === "string" ? parsed.eventType.trim() : "feature",
    theme: typeof parsed.theme === "string" ? parsed.theme.trim() : "",
    objective: typeof parsed.objective === "string" ? parsed.objective.trim() : "",
    eventBrief: asObject(parsed.eventBrief),
  };
}

function parseChannelJson(raw: string) {
  const parsed = parseRecordJson(raw);
  const googlePlayValue = parsed.googlePlay ?? (parsed.googlePlayOptions ? { options: parsed.googlePlayOptions } : {});
  return {
    googlePlay: Array.isArray(googlePlayValue) ? { options: googlePlayValue } : asObject(googlePlayValue),
    appleEvent: asObject(parsed.appleEvent),
    siteEntry: asObject(parsed.siteEntry),
    localization: asArray(parsed.localization),
    creative: asObject(parsed.creative),
  };
}

type EventChannel = "googlePlay" | "appleEvent" | "siteEntry" | "localization" | "creative";

function objectJson(value: unknown, fallback: string | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? JSON.stringify(value) : fallback ?? "{}";
}

function arrayJson(value: unknown, fallback: string | undefined) {
  return Array.isArray(value) ? JSON.stringify(value) : fallback ?? "[]";
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function safeFailureDetail(failures: string[], apiKey: string) {
  return safeOpenCodeFailureDetails(failures, apiKey);
}

type JsonStageRequest<T> = {
  candidates: string[];
  apiKey: string;
  baseUrl?: string;
  transport?: import("../../../../lib/opencode-models").OpenCodeTransport;
  sessionId: string;
  system: string;
  prompt: string;
  retryPrompt: string;
  deadline: number;
  maxTokens: number;
  retryMaxTokens: number;
  parse: (raw: string) => T;
  validate: (value: T) => boolean;
};

async function generateJsonStage<T>(request: JsonStageRequest<T>) {
  const failures: string[] = [];
  for (const [candidateIndex, candidate] of request.candidates.entries()) {
    if (request.deadline - Date.now() < 5_000) {
      failures.push("Generation time budget exhausted.");
      break;
    }
    for (const [attemptPrompt, isRetry] of [[request.prompt, false], [request.retryPrompt, true]] as const) {
      const remaining = request.deadline - Date.now();
      if (remaining < 5_000) break;
      const result = await requestOpenCode({
        model: candidate,
        apiKey: request.apiKey,
        baseUrl: request.baseUrl,
        transport: request.transport,
        sessionId: request.sessionId,
        system: request.system,
        prompt: attemptPrompt,
        maxTokens: isRetry ? request.retryMaxTokens : request.maxTokens,
        timeoutMs: Math.min(isRetry ? 25_000 : 35_000, remaining),
        jsonMode: isRetry && (request.transport ?? getOpenCodeTransport(candidate)) === "chat",
      });
      if (!result.ok) {
        failures.push(`${candidate}: ${result.errorMessage || `HTTP ${result.status || "unknown"}.`}`);
        break;
      }
      try {
        const parsed = request.parse(result.text);
        if (request.validate(parsed)) return { value: parsed, model: candidate, fallbacksUsed: candidateIndex, failures };
        failures.push(`${candidate}: returned incomplete JSON${isRetry ? "." : "; retrying with a compact request."}`);
      } catch (error) {
        failures.push(`${candidate}: ${error instanceof Error ? error.message : "returned invalid JSON"}${isRetry ? "." : "; retrying with a compact request."}`);
      }
    }
  }
  return { value: null, model: null, fallbacksUsed: 0, failures };
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as {
      productId?: number;
      eventId?: number;
      stage?: "strategy" | "channel";
      channel?: EventChannel;
      locale?: "en" | "ar";
      title?: string;
      eventType?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
      theme?: string;
      objective?: string;
      eventIdea?: string;
      eventBrief?: Record<string, unknown>;
      googlePlay?: unknown;
      appleEvent?: unknown;
      siteEntry?: unknown;
      localization?: unknown;
      creative?: unknown;
    };
    const stage = payload.stage ?? "strategy";
    if (stage !== "strategy" && stage !== "channel") return Response.json({ error: "Choose strategy or a single channel to generate." }, { status: 400 });
    const allowedChannels: EventChannel[] = ["googlePlay", "appleEvent", "siteEntry", "localization", "creative"];
    if (stage === "channel" && !allowedChannels.includes(payload.channel as EventChannel)) return Response.json({ error: "Choose one channel to generate." }, { status: 400 });
    if (stage === "channel" && payload.channel === "localization" && payload.locale !== "en" && payload.locale !== "ar") return Response.json({ error: "Choose English or Arabic localization." }, { status: 400 });
    const channel = payload.channel as EventChannel;
    const locale = payload.locale === "ar" ? "ar" : "en";
    const productId = Number(payload.productId);
    const startDate = typeof payload.startDate === "string" ? payload.startDate : "";
    const endDate = typeof payload.endDate === "string" ? payload.endDate : "";
    const invalidDateRange = Boolean(startDate && endDate && endDate < startDate);
    if (invalidDateRange) return Response.json({ error: "End date must be on or after the start date." }, { status: 400 });
    const inputBrief = payload.eventBrief && typeof payload.eventBrief === "object" ? payload.eventBrief : {};
    const requestedTitle = typeof payload.title === "string" ? payload.title.trim() : "";
    const requestedIdea = (typeof payload.eventIdea === "string" ? payload.eventIdea : typeof inputBrief.idea === "string" ? inputBrief.idea : "").trim();
    const ownerId = await getOwnerId();
    if (!ownerId) return ownerAuthenticationRequired();
    const db = getDb();
    const [product] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.ownerId, ownerId))).limit(1);
    if (!product) return Response.json({ error: "Choose a product before building an event." }, { status: 400 });
    let existingEvent: typeof promoEvents.$inferSelect | undefined;
    if (payload.eventId) {
      [existingEvent] = await db.select().from(promoEvents).where(and(eq(promoEvents.id, Number(payload.eventId)), eq(promoEvents.ownerId, ownerId))).limit(1);
      if (!existingEvent) return Response.json({ error: "Promo event not found." }, { status: 404 });
      if (existingEvent.productId !== productId) return Response.json({ error: "This event belongs to a different product." }, { status: 400 });
    }
    if (stage === "channel" && !existingEvent) return Response.json({ error: "Save the event details before building channel drafts." }, { status: 409 });
    const [research] = await db.select().from(researchBriefs).where(and(eq(researchBriefs.productId, productId), eq(researchBriefs.ownerId, ownerId))).limit(1);
    const eventIdea = requestedIdea || requestedTitle || existingEvent?.title?.trim() || "";
    if (!eventIdea) return Response.json({ error: "Enter an event name before generating with AI." }, { status: 400 });
    const [optimization] = await db.select().from(optimizationPlans).where(and(eq(optimizationPlans.productId, productId), eq(optimizationPlans.ownerId, ownerId))).limit(1);
    const [create] = await db.select().from(createBriefs).where(and(eq(createBriefs.productId, productId), eq(createBriefs.ownerId, ownerId))).limit(1);
    const runtime = await getOpenCodeRuntime();
    const apiKey = runtime.apiKey;
    if (!apiKey) return Response.json({ error: "OpenCode is not connected yet. Add an OpenCode API key before building event outputs." }, { status: 503 });
    const candidates = getGenerationModels(runtime)
      .map((id) => runtime.providerId === "opencode" ? getOpenCodeModel(id)?.id : id)
      .filter((id, index, list): id is string => Boolean(id) && list.indexOf(id) === index)
      // Muse is region-limited. Keep it usable when explicitly selected as the active model,
      // but do not spend the fallback budget on it after another model has failed.
      .filter((id, index) => index === 0 || !getOpenCodeModel(id)?.regionLimited);
    const currentListing = parseJson<Record<string, unknown>>(optimization?.currentListing, {});
    const opportunities = parseJson<unknown[]>(optimization?.opportunities, []);
    const nextActions = parseJson<unknown[]>(optimization?.nextActions, []);
    const storeVariants = parseJson<unknown[]>(create?.storeVariants, []);
    const answerBlocks = parseJson<unknown[]>(create?.answerBlocks, []);
    const promoBrief = parseJson<Record<string, unknown>>(create?.promoBrief, {});
    const creativeBrief = parseJson<Record<string, unknown>>(create?.creativeBrief, {});
    const knowledgeContext = compact({
      research: {
        intent: research?.intent || "",
        semanticCore: research?.semanticCore || "",
        alternatives: research?.competitors || "",
        proof: research?.proof || "",
        notes: research?.notes || "",
      },
      optimization: {
        focus: optimization?.focus || "",
        storeTitle: optimization?.storeTitle || "",
        storeSubtitle: optimization?.storeSubtitle || "",
        storeShortDescription: optimization?.storeShortDescription || "",
        storeLongDescription: optimization?.storeLongDescription || "",
        answerSummary: optimization?.answerSummary || "",
        currentListing,
        opportunities,
        nextActions,
      },
      creation: { primaryMessage: create?.primaryMessage || "", storeVariants, answerBlocks, promoBrief, creativeBrief },
    }, 10000);
    const eventContext = [
      "Event request: " + eventIdea,
      "Existing event title: " + (requestedTitle || existingEvent?.title || "not provided"),
      "Event type: " + (payload.eventType || existingEvent?.eventType || "feature"),
      "Theme: " + (payload.theme?.trim() || existingEvent?.theme || "not provided"),
      "Objective: " + (payload.objective?.trim() || existingEvent?.objective || "not provided"),
      "Dates: " + (invalidDateRange ? "not scheduled — the existing date range needs correction" : (startDate || "not scheduled") + (endDate ? ` to ${endDate}` : "")),
      "Existing manual brief: " + compact(inputBrief, 3500),
    ].join("\n");
    let strategy: { title: string; eventType: string; theme: string; objective: string; eventBrief: Record<string, unknown> };
    let strategyModel: string | null = null;
    let strategyFallbacksUsed = 0;
    if (stage === "strategy") {
      const strategyPrompt = [
        "Build only the event strategy. Do not write Google Play, Apple, SEO, localization, or creative copy yet.",
        "The event request is an idea, not proof that a feature, reward, or mechanic exists. Use confirmed product facts; leave unsupported mechanics empty and put specific questions in eventBrief.notes. Never invent rewards, features or participation rules.",
        "Return JSON only with exactly these keys: title, eventType, theme, objective, eventBrief.",
        "eventBrief must contain idea, whatNew, userValue, participation, requirements, rewards, content, missions, bonuses, notes. Keep every value concise and reviewable.",
        eventContext,
        "Product: " + product.name + " | type: " + product.type + " | positioning: " + (product.position || "not provided") + " | audience: " + (product.audience || "not provided"),
        "Product knowledge base: " + knowledgeContext,
      ].join("\n");
      const strategyRetryPrompt = [
        "Return only one valid JSON object. No markdown, explanation, or code fence.",
        "Use exactly: title, eventType, theme, objective, eventBrief.",
        "eventBrief keys: idea, whatNew, userValue, participation, requirements, rewards, content, missions, bonuses, notes.",
        eventContext,
        "Product: " + product.name + " — " + (product.position || product.type || "mobile product"),
      ].join("\n");
      const strategyResult = await generateJsonStage({
        candidates,
        apiKey,
        baseUrl: runtime.baseUrl,
        transport: runtime.transport,
        sessionId: "sorted-calendar-strategy-" + productId,
        system: "You are a careful live-ops editor. Use only confirmed input facts. Never invent mechanics or rewards. Leave unknown fields empty and list missing facts as questions in notes. Preserve the user’s event identity. Return valid JSON only.",
        prompt: strategyPrompt,
        retryPrompt: strategyRetryPrompt,
        deadline: Date.now() + 60_000,
        maxTokens: 2800,
        retryMaxTokens: 2200,
        parse: parseStrategyJson,
        validate: (value) => Boolean(value.title && Object.values(value.eventBrief).filter((item) => hasText(item)).length >= 4),
      });
      if (!strategyResult.value) {
        const failureDetail = safeFailureDetail(strategyResult.failures, apiKey);
        const restrictionMessage = openCodeWorkspaceRestrictionMessage(strategyResult.failures);
        if (restrictionMessage) return Response.json({ error: restrictionMessage, detail: failureDetail }, { status: 502 });
        return Response.json({ error: "OpenCode could not build the event strategy.", detail: failureDetail || "No model returned a usable strategy." }, { status: 502 });
      }
      strategy = strategyResult.value;
      strategyModel = strategyResult.model;
      strategyFallbacksUsed = strategyResult.fallbacksUsed;

      const generatedBrief = { ...inputBrief, ...strategy.eventBrief, idea: eventIdea || (hasText(strategy.eventBrief.idea) ? strategy.eventBrief.idea : "") };
      const values = {
        productId,
        ownerId,
        title: requestedTitle || existingEvent?.title || strategy.title || eventIdea || "Untitled promo event",
        eventType: payload.eventType || existingEvent?.eventType || strategy.eventType || "feature",
        status: payload.status || existingEvent?.status || "planned",
        startDate,
        endDate,
        theme: strategy.theme || payload.theme?.trim() || existingEvent?.theme || eventIdea,
        objective: strategy.objective || payload.objective?.trim() || existingEvent?.objective || "",
        eventBrief: JSON.stringify(generatedBrief),
        googlePlay: objectJson(payload.googlePlay, existingEvent?.googlePlay),
        appleEvent: objectJson(payload.appleEvent, existingEvent?.appleEvent),
        siteEntry: objectJson(payload.siteEntry, existingEvent?.siteEntry),
        localization: arrayJson(payload.localization, existingEvent?.localization),
        creative: objectJson(payload.creative, existingEvent?.creative),
        updatedAt: new Date().toISOString(),
      };
      const [savedEvent] = existingEvent
        ? await db.update(promoEvents).set(values).where(eq(promoEvents.id, existingEvent.id)).returning()
        : await db.insert(promoEvents).values(values).returning();
      if (!savedEvent) throw new Error("The event strategy could not be saved.");
      return Response.json({ event: serializeEvent(savedEvent, product.name), model: strategyModel, fallbacksUsed: strategyFallbacksUsed, stage: "strategy" });
    }

    const existingBrief = parseJson<Record<string, unknown>>(existingEvent?.eventBrief, {});
    if (!existingEvent || !hasText(existingBrief.whatNew)) return Response.json({ error: "Describe what is happening in the event, then save it before generating copy." }, { status: 409 });
    const englishSource = selectedPromoCopy({ googlePlay: parseJson(existingEvent.googlePlay, {}) });
    if (channel === "localization" && locale === "ar" && (!hasText(englishSource.tagline) || !hasText(englishSource.description))) {
      return Response.json({ error: "Choose a Google Play English option before translating." }, { status: 409 });
    }
    strategy = { title: existingEvent.title, eventType: existingEvent.eventType, theme: existingEvent.theme, objective: existingEvent.objective, eventBrief: existingBrief };

    const channelInstructions: Record<EventChannel, string> = {
      googlePlay: "Generate only Google Play Promo Event copy. Return a googlePlay object with exactly 3 options, each with tagline and description. Every tagline must be 80 characters or fewer; every description must be 500 characters or fewer, single paragraph, and avoid generic CTAs such as Play now, Buy now, or Install now.",
      appleEvent: "Generate only Apple In-App Event copy. Return appleEvent with name (30 characters max), subtitle (50 max), and description (120 max).",
      siteEntry: "Generate only the AEO / SEO site entry. Return siteEntry with headline, slug, excerpt, body, keywords, and cta. Keep it factual and useful without promising rankings or visibility.",
      localization: locale === "en"
        ? "Generate only the English localization. Return localization as a one-item array with locale exactly en, tagline, description, and status draft. English must be completed before Arabic is generated."
        : "Generate only the Arabic localization. Return localization as a one-item array with locale exactly ar, tagline, description, and status draft. Adapt the saved English copy naturally for Arabic; do not translate mechanically.",
      creative: "Generate only the creative handoff. Return creative with concept, prompt, dimensions, safeAreas, and proofToShow. The prompt must explicitly say: no embedded text, no logos, no slogans, no event-name typography, no CTA text, no buttons, and no CTA-like graphics. Include this exact sentence in both prompt and safeAreas: Keep critical artwork inside safe zones and away from crop zones. Use only verifiable product and event details.",
    };
    const channelInstruction = channelInstructions[channel];
    const localizationContext = channel === "localization" && locale === "ar"
      ? "Selected Google Play English source: " + compact(englishSource, 1600)
      : "";
    const packagePrompt = [
      "Use the saved event strategy as the source of truth. Generate one independent channel draft only; leave every other channel untouched.",
      "Do not invent product features, rewards, results, or confirmed event mechanics. Omit any unconfirmed or proposed mechanics entirely from customer-facing copy. Notes and proposals are not confirmed facts.",
      "Return JSON only with exactly one top-level key: " + channel + ".",
      channelInstruction,
      "Saved event strategy: " + compact(strategy, 6500),
      "Product identity: " + product.name + " | type: " + product.type,
      "Product knowledge base: " + knowledgeContext,
      localizationContext,
    ].filter(Boolean).join("\n");
    const packageRetryPrompt = [
      "Return one valid JSON object only, with exactly one top-level key: " + channel + ".",
      channelInstruction,
      "Saved event strategy: " + compact(strategy, 6000),
      "Product knowledge base: " + knowledgeContext,
      localizationContext,
    ].filter(Boolean).join("\n");
    const packageResult = await generateJsonStage({
      candidates,
      apiKey,
      baseUrl: runtime.baseUrl,
      transport: runtime.transport,
      sessionId: `sorted-calendar-${channel}-${locale}-${productId}`,
      system: "You are a careful organic marketing editor. Use only confirmed facts. Never include proposals, unanswered questions or unverified rewards in customer-facing copy. Return valid JSON only.",
      prompt: packagePrompt,
      retryPrompt: packageRetryPrompt,
      deadline: Date.now() + 60_000,
      maxTokens: channel === "siteEntry" ? 3000 : channel === "creative" ? 2200 : 1800,
      retryMaxTokens: 2600,
      parse: parseChannelJson,
      validate: (value) => {
        if (channel === "googlePlay") {
          const options = asArray(asObject(value.googlePlay).options).map(asObject);
          return options.length === 3 && options.every((option) => hasText(option.tagline) && option.tagline.length <= 80 && hasText(option.description) && option.description.length <= 500 && !option.description.includes("\n"));
        }
        if (channel === "appleEvent") {
          const apple = asObject(value.appleEvent);
          return hasText(apple.name) && apple.name.length <= 30 && hasText(apple.subtitle) && apple.subtitle.length <= 50 && hasText(apple.description) && apple.description.length <= 120;
        }
        if (channel === "siteEntry") {
          const site = asObject(value.siteEntry);
          return hasText(site.headline) && hasText(site.slug) && hasText(site.excerpt) && hasText(site.body) && Array.isArray(site.keywords);
        }
        if (channel === "localization") {
          const item = asArray(value.localization).map(asObject).find((entry) => entry.locale === locale);
          return Boolean(item && hasText(item.tagline) && item.tagline.length <= 80 && hasText(item.description) && item.description.length <= 500 && !item.description.includes("\n"));
        }
        const creative = asObject(value.creative);
        const prompt = typeof creative.prompt === "string" ? creative.prompt.toLowerCase() : "";
        const safeAreas = typeof creative.safeAreas === "string" ? creative.safeAreas.toLowerCase() : "";
        const requiredRules = ["no embedded text", "no logos", "no slogans", "no event-name typography", "no cta text", "no buttons", "no cta-like graphics", "keep critical artwork inside safe zones and away from crop zones"];
        return hasText(creative.concept) && hasText(creative.prompt) && requiredRules.every((rule) => prompt.includes(rule)) && hasText(creative.dimensions) && hasText(creative.safeAreas) && safeAreas.includes("keep critical artwork inside safe zones and away from crop zones") && asArray(creative.proofToShow).some(hasText);
      },
    });
    if (!packageResult.value) {
      const failureDetail = safeFailureDetail(packageResult.failures, apiKey);
      const channelName = channel === "googlePlay" ? "Google Play" : channel === "appleEvent" ? "Apple" : channel === "siteEntry" ? "AEO / SEO" : channel === "localization" ? `${locale === "en" ? "English" : "Arabic"} localization` : "creative";
      const restrictionMessage = openCodeWorkspaceRestrictionMessage(packageResult.failures);
      const recovery = restrictionMessage ? ` Fix model access before retrying this channel. ${restrictionMessage}` : " Retry this channel when ready.";
      return Response.json({ error: `${channelName} draft could not be prepared. The strategy and other channel drafts are saved.${recovery}`, detail: failureDetail || "No model returned a usable draft.", channel }, { status: 502 });
    }

    const updateValues: Partial<typeof promoEvents.$inferInsert> = { updatedAt: new Date().toISOString() };
    if (channel === "googlePlay") {
      const googlePlay = asObject(packageResult.value.googlePlay);
      const options = asArray(googlePlay.options);
      const firstOption = asObject(options[0]);
      updateValues.googlePlay = JSON.stringify({ ...googlePlay, selectedOption: 0, tagline: firstOption.tagline ?? "", description: firstOption.description ?? "" });
    } else if (channel === "appleEvent") {
      updateValues.appleEvent = JSON.stringify(packageResult.value.appleEvent);
    } else if (channel === "siteEntry") {
      updateValues.siteEntry = JSON.stringify(packageResult.value.siteEntry);
    } else if (channel === "creative") {
      updateValues.creative = JSON.stringify(packageResult.value.creative);
    } else {
      const generatedLocale = asArray(packageResult.value.localization).map(asObject).find((item) => item.locale === locale);
      if (!generatedLocale) return Response.json({ error: "The localization model returned no matching language draft." }, { status: 502 });
      const currentLocales = parseJson<unknown[]>(existingEvent.localization, []).map(asObject);
      const localized = [...currentLocales.filter((item) => item.locale !== locale), { ...generatedLocale, locale, status: "draft", sourceTagline: englishSource.tagline, sourceDescription: englishSource.description }];
      const localeOrder = (value: unknown) => value === "en" ? 0 : value === "ar" ? 1 : 2;
      localized.sort((left, right) => localeOrder(left.locale) - localeOrder(right.locale));
      updateValues.localization = JSON.stringify(localized);
    }
    const [savedEvent] = await db.update(promoEvents).set(updateValues).where(eq(promoEvents.id, existingEvent.id)).returning();
    if (!savedEvent) throw new Error("The channel draft could not be saved.");
    return Response.json({ event: serializeEvent(savedEvent, product.name), model: packageResult.model, fallbacksUsed: packageResult.fallbacksUsed, stage: "channel", channel, locale: channel === "localization" ? locale : undefined });
  } catch (error) {
    console.error("promo event generation failed", error);
    return Response.json({ error: "The promo event request failed. Check the product foundation and OpenCode configuration." }, { status: 500 });
  }
}
