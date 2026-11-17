// The runtime's stream parser must keep Gemini's parallel tool calls apart and keep
// their thought_signature (vendor/agentify-website/runtime/llm.js, PasarAgen edit).
import test from "node:test";
import assert from "node:assert/strict";
import { LlmClient } from "../vendor/agentify-website/runtime/llm.js";

function sse(chunks) {
  return new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n");
}

test("Gemini parallel tool calls at one index stay separate, with signatures", async () => {
  const resp = sse([
    { choices: [{ delta: { tool_calls: [{ index: 0, id: "a", type: "function", function: { name: "dapur_bu_sri", arguments: "{\"request\":\"x\"}" }, extra_content: { google: { thought_signature: "S" } } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, id: "b", type: "function", function: { name: "kue_mbak_ani", arguments: "{\"request\":\"y\"}" } }] }, finish_reason: "tool_calls" }] },
  ]);
  const r = await new LlmClient({ baseUrl: "http://x" })._readSse(resp, () => {}, null, null);
  assert.deepEqual(r.toolCalls.map((t) => t.function.name), ["dapur_bu_sri", "kue_mbak_ani"]);
  assert.equal(r.toolCalls[0].extra_content.google.thought_signature, "S");
});

test("OpenAI-style streamed arguments still join by index", async () => {
  const resp = sse([
    { choices: [{ delta: { tool_calls: [{ index: 0, id: "a", function: { name: "f", arguments: "{\"q\":" } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "1}" } }] }, finish_reason: "tool_calls" }] },
  ]);
  const r = await new LlmClient({ baseUrl: "http://x" })._readSse(resp, () => {}, null, null);
  assert.equal(r.toolCalls.length, 1);
  assert.equal(r.toolCalls[0].function.arguments, "{\"q\":1}");
});
