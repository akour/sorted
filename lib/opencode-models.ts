export type OpenCodeModel = {
  id: string;
  name: string;
  family: string;
  status: "supported";
  regionLimited?: boolean;
};

// Keep display names separate from provider IDs so the settings UI can stay
// stable when OpenCode changes how a model is addressed.
export const OPENCODE_MODELS: OpenCodeModel[] = [
  { id: "grok-4.7", name: "Grok 4.7", family: "Grok", status: "supported" },
  { id: "grok-4.6", name: "Grok 4.6", family: "Grok", status: "supported" },
  { id: "glm-5.3-flash", name: "GLM-5.3-Flash", family: "GLM", status: "supported" },
  { id: "glm-5.3", name: "GLM-5.3", family: "GLM", status: "supported" },
  { id: "glm-5.2", name: "GLM-5.2", family: "GLM", status: "supported" },
  { id: "glm-5.1", name: "GLM-5.1", family: "GLM", status: "supported" },
  { id: "gpt-5.6-luna", name: "GPT 5.6 Luna", family: "GPT", status: "supported" },
  { id: "kimi-k3", name: "Kimi K3", family: "Kimi", status: "supported" },
  { id: "kimi-k2.7-code", name: "Kimi K2.7 Code", family: "Kimi", status: "supported" },
  { id: "kimi-k2.6", name: "Kimi K2.6", family: "Kimi", status: "supported" },
  { id: "longcat-2.0", name: "LongCat-2.0", family: "LongCat", status: "supported" },
  { id: "mimo-v2.6-flash", name: "MiMo-V2.6-Flash", family: "MiMo", status: "supported" },
  { id: "mimo-v2.6-pro", name: "MiMo-V2.6-Pro", family: "MiMo", status: "supported" },
  { id: "mimo-v2.5", name: "MiMo-V2.5", family: "MiMo", status: "supported" },
  { id: "mimo-v2.5-pro", name: "MiMo-V2.5-Pro", family: "MiMo", status: "supported" },
  { id: "minimax-m3", name: "MiniMax M3", family: "MiniMax", status: "supported" },
  { id: "minimax-m2.7", name: "MiniMax M2.7", family: "MiniMax", status: "supported" },
  { id: "muse-spark-1.3-contributor", name: "Muse Spark 1.3 Contributor", family: "Muse Spark", status: "supported", regionLimited: true },
  { id: "muse-spark-1.2-contributor", name: "Muse Spark 1.2 Contributor", family: "Muse Spark", status: "supported", regionLimited: true },
  { id: "qwen3.8-max", name: "Qwen3.8 Max", family: "Qwen", status: "supported" },
  { id: "qwen3.8-flash", name: "Qwen3.8 Flash", family: "Qwen", status: "supported" },
  { id: "qwen3.7-max", name: "Qwen3.7 Max", family: "Qwen", status: "supported" },
  { id: "qwen3.7-plus", name: "Qwen3.7 Plus", family: "Qwen", status: "supported" },
  { id: "qwen3.6-plus", name: "Qwen3.6 Plus", family: "Qwen", status: "supported" },
  { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", family: "DeepSeek", status: "supported" },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", family: "DeepSeek", status: "supported" },
  { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", family: "DeepSeek", status: "supported" },
  { id: "deepseek-v4-flash-vision-exp", name: "DeepSeek V4 Flash Vision Exp", family: "DeepSeek", status: "supported" },
  { id: "hy4-preview", name: "Hy4 preview", family: "Hy", status: "supported" },
  { id: "hy3", name: "Hy3", family: "Hy", status: "supported" },
];

export const DEFAULT_OPENCODE_MODEL = "deepseek-v4.1-flash";

const RESPONSE_MODELS = new Set(["grok-4.7", "grok-4.6", "gpt-5.6-luna", "muse-spark-1.3-contributor", "muse-spark-1.2-contributor"]);
const MESSAGE_MODELS = new Set(["minimax-m3", "minimax-m2.7", "qwen3.8-max", "qwen3.8-flash", "qwen3.7-max", "qwen3.7-plus", "qwen3.6-plus"]);

export type OpenCodeTransport = "chat" | "responses" | "messages";

export function getOpenCodeTransport(id: string): OpenCodeTransport {
  if (RESPONSE_MODELS.has(id)) return "responses";
  if (MESSAGE_MODELS.has(id)) return "messages";
  return "chat";
}

export function getOpenCodeModel(id: string | undefined) {
  return OPENCODE_MODELS.find((model) => model.id === id);
}
