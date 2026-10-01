import assert from "node:assert/strict";
import test from "node:test";
import { getProviderModelTransport, getProviderRuntimeTransport } from "../lib/opencode-models.ts";

test("OpenCode leaves the runtime transport unset so fallbacks can select their own protocol", () => {
  assert.equal(getProviderRuntimeTransport("opencode", "openai-compatible"), undefined);
  assert.equal(getProviderRuntimeTransport("openai", "openai-compatible"), "chat");
  assert.equal(getProviderRuntimeTransport("anthropic", "anthropic"), "messages");
});

test("OpenCode active and fallback models resolve to their catalogued protocols", () => {
  const models = ["mimo-v2.6-flash", "deepseek-v4-flash", "qwen3.8-flash", "grok-4.7"];
  assert.deepEqual(models.map((model) => getProviderModelTransport("opencode", "openai-compatible", model)), [
    "chat", "chat", "messages", "responses",
  ]);
});
