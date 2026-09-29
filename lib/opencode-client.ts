import { getOpenCodeTransport, OpenCodeTransport } from "./opencode-models";

type OpenCodePayload = {
  choices?: Array<{ message?: { content?: unknown } }>;
  output_text?: string;
  output?: unknown;
  content?: unknown;
  error?: { message?: string } | string;
  message?: string;
};

export type OpenCodeRequest = {
  model: string;
  apiKey: string;
  baseUrl?: string;
  system: string;
  prompt: string;
  sessionId: string;
  maxTokens?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
  transport?: OpenCodeTransport;
};

export function safeOpenCodeFailureDetails(failures: string[], apiKey: string) {
  const exactSecretRedacted = apiKey ? failures.join(" | ").replaceAll(apiKey, "[redacted]") : failures.join(" | ");
  const sanitized = exactSecretRedacted
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/(authorization|x-api-key|api[_-]?key|access[_-]?token|secret)\s*[:=]\s*["']?[^\s,;"'}]+/gi, "$1: [redacted]")
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/gi, "[redacted]")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[redacted]")
    .replace(/(https?:\/\/[^\s?]+)\?[^\s]+/gi, "$1?[redacted]")
    .replace(/[\r\n\t]+/g, " ");
  if (sanitized.length <= 420) return sanitized;
  const prefix = sanitized.slice(0, 420);
  const wordBoundary = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, wordBoundary > 0 ? wordBoundary : prefix.length).trimEnd()}…`;
}

export function openCodeWorkspaceRestrictionMessage(failures: string[]) {
  const combined = failures.join(" ").toLowerCase();
  if (combined.includes("trains on request data") || combined.includes("train on request data") || combined.includes("paid endpoints that train")) {
    return "OpenCode blocked a selected model because this workspace disallows endpoints that train on request data. Remove those models from Sorted’s active or fallback order, or allow this endpoint type in OpenCode Privacy settings only if you accept its data-use terms.";
  }
  if (combined.includes("global regions") || combined.includes("global region")) {
    return "OpenCode blocked a selected model because this workspace does not allow Global regions. Allow Global regions in OpenCode settings, or choose a model available in the current region.";
  }
  if (combined.includes("privacy settings")) {
    return "OpenCode blocked a selected model under this workspace’s Privacy settings. Review the provider details below, or choose a model allowed by the current policy.";
  }
  return null;
}

export async function requestOpenCodeWithFallback<T>(request: Omit<OpenCodeRequest, "model"> & { models: string[]; validate: (text: string) => T | null; totalTimeoutMs?: number }) {
  const failures: string[] = [];
  const startedAt = Date.now();
  const attemptTimeoutMs = Math.max(1_000, request.timeoutMs ?? 30_000);
  const totalTimeoutMs = Math.max(attemptTimeoutMs, request.totalTimeoutMs ?? attemptTimeoutMs * request.models.length);
  for (const model of request.models) {
    const remainingMs = totalTimeoutMs - (Date.now() - startedAt);
    if (remainingMs < 1_000) {
      failures.push(`${model}: Skipped because the overall generation time limit was reached.`);
      break;
    }
    const result = await requestOpenCode({ ...request, model, timeoutMs: Math.min(attemptTimeoutMs, remainingMs) });
    if (!result.ok) {
      failures.push(`${model}: ${result.errorMessage}`);
      continue;
    }
    try {
      const value = request.validate(result.text);
      if (value) return { value, model, failures };
      failures.push(`${model}: returned an unusable response.`);
    } catch (error) {
      failures.push(`${model}: ${error instanceof Error ? error.message : "returned invalid JSON."}`);
    }
  }
  return { value: null, model: null, failures };
}

function endpointFor(baseUrl: string, transport: OpenCodeTransport) {
  const root = baseUrl.replace(/\/(?:chat\/completions|responses|messages)\/?$/, "").replace(/\/$/, "");
  const path = transport === "responses" ? "responses" : transport === "messages" ? "messages" : "chat/completions";
  return `${root}/${path}`;
}

export function extractOpenCodeText(payload: OpenCodePayload) {
  const read = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(read).filter(Boolean).join("\n");
    if (!value || typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.output_text === "string") return record.output_text;
    if (record.content !== undefined) return read(record.content);
    return "";
  };
  return read(payload.choices?.[0]?.message?.content)
    || read(payload.output_text)
    || read(payload.output)
    || read(payload.content);
}

export async function requestOpenCode(request: OpenCodeRequest) {
  const transport = request.transport ?? getOpenCodeTransport(request.model);
  const baseUrl = request.baseUrl ?? "https://opencode.ai/zen/go/v1/chat/completions";
  const endpoint = endpointFor(baseUrl, transport);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-opencode-session": request.sessionId,
    "user-agent": "Sorted/0.1 organic-marketing-workspace",
  };
  let body: Record<string, unknown>;

  if (transport === "responses") {
    headers.authorization = `Bearer ${request.apiKey}`;
    body = {
      model: request.model,
      instructions: request.system,
      input: [{ role: "user", content: [{ type: "input_text", text: request.prompt }] }],
      temperature: 0.2,
      max_output_tokens: request.maxTokens ?? 4000,
      stream: false,
    };
  } else if (transport === "messages") {
    headers["x-api-key"] = request.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    body = {
      model: request.model,
      system: request.system,
      messages: [{ role: "user", content: request.prompt }],
      temperature: 0.2,
      max_tokens: request.maxTokens ?? 4000,
      stream: false,
    };
  } else {
    headers.authorization = `Bearer ${request.apiKey}`;
    body = {
      model: request.model,
      temperature: 0.2,
      max_tokens: request.maxTokens ?? 4000,
      messages: [{ role: "system", content: request.system }, { role: "user", content: request.prompt }],
      stream: false,
    };
    if (request.jsonMode) body.response_format = { type: "json_object" };
  }

  const timeoutMs = Math.max(1_000, request.timeoutMs ?? 30_000);
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
    const responseText = await response.text();
    let payload: OpenCodePayload;
    try {
      payload = JSON.parse(responseText) as OpenCodePayload;
    } catch {
      // Some compatible gateways return the model answer as plain text even when
      // the request was not streamed. Preserve it so the caller can still parse it.
      payload = { content: responseText };
    }
    return {
      ok: response.ok,
      status: response.status,
      endpoint,
      transport,
      payload,
      text: extractOpenCodeText(payload),
      errorMessage: typeof payload.error === "string"
        ? payload.error
        : payload.error?.message ?? payload.message ?? (response.ok ? "" : responseText.slice(0, 240) || `OpenCode returned HTTP ${response.status}.`),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      endpoint,
      transport,
      payload: {},
      text: "",
      errorMessage: timedOut
        ? `Timed out after ${Math.round(timeoutMs / 1000)} seconds.`
        : error instanceof Error ? error.message : "OpenCode request failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
