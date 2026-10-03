/**
 * anthropicClient.js — Anthropic Claude API Client
 *
 * Follows the same interface pattern as groqClient.js and openaiClient.js:
 *   - chatJsonAnthropic({ system, user, model, apiKey, maxTokens, temperature })
 *   - chatTextAnthropic({ system, user, model, apiKey, maxTokens, temperature })
 *
 * Uses the official @anthropic-ai/sdk package.
 */

import Anthropic from "@anthropic-ai/sdk";

export let anthropicClient = null;
const apiKey = process.env.ANTHROPIC_API_KEY || "";

if (apiKey) {
  anthropicClient = new Anthropic({ apiKey });
  console.log(`[quizall] ✅ Anthropic client initialized successfully`);
  const maskedKey = apiKey.length > 11
    ? `${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}`
    : "***";
  console.log(`[quizall] Anthropic API Key: ${maskedKey} (masked)`);
} else {
  console.warn("[quizall] ⚠️  ANTHROPIC_API_KEY is not set; Anthropic features are disabled.");
}

export class AnthropicDisabledError extends Error {
  constructor(message = "Anthropic features are disabled (ANTHROPIC_API_KEY not set)") {
    super(message);
    this.name = "AnthropicDisabledError";
    this.code = "ANTHROPIC_DISABLED";
  }
}

function isInsideJsonString(text) {
  let inString = false;
  let escape = false;
  for (const ch of text) {
    if (!inString) {
      if (ch === '"') inString = true;
      continue;
    }
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') inString = false;
  }
  return inString;
}

function closeJsonContainers(text) {
  const stack = [];
  let inString = false;
  let escape = false;
  for (const ch of text) {
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if ((ch === "}" || ch === "]") && stack.length && stack[stack.length - 1] === ch) {
      stack.pop();
    }
  }
  return stack.reverse().join("");
}

/**
 * Recover JSON when the model truncates output or wraps it in markdown fences.
 * Returns {} if nothing usable can be parsed.
 */
export function parseJsonLenient(text) {
  const raw = String(text || "").trim();
  if (!raw) return {};

  const unfenced = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = unfenced.search(/[\{\[]/);
  const candidate = start >= 0 ? unfenced.slice(start) : unfenced;

  try {
    return JSON.parse(candidate);
  } catch {
    // continue to repair
  }

  let repaired = candidate;
  if (isInsideJsonString(repaired)) repaired += '"';
  repaired = repaired
    .replace(/,\s*$/, "")
    .replace(/,\s*"[^"\\]*"\s*:\s*$/, "")
    .replace(/,\s*"[^"\\]*"\s*$/, "")
    .replace(/:\s*$/, "")
    .replace(/,\s*$/, "");
  repaired += closeJsonContainers(repaired);

  try {
    return JSON.parse(repaired);
  } catch (parseError) {
    console.error(`[quizall] ⚠️  Anthropic JSON parse failed:`, parseError.message);
    return {};
  }
}

/**
 * Chat completion that returns JSON via Anthropic Claude
 *
 * @returns {{ data: object, usage: object, model: string, completionId: string|null }}
 */
export async function chatJsonAnthropic({ system, user, model, apiKey: overrideKey, maxTokens, temperature }) {
  let client = anthropicClient;

  if (overrideKey) {
    client = new Anthropic({ apiKey: overrideKey });
  }

  if (!client) {
    console.error("[quizall] ❌ Anthropic call blocked: client not initialized (ANTHROPIC_API_KEY not set)");
    throw new AnthropicDisabledError();
  }

  const resolvedModel = model || "claude-haiku-4-5-20251001";
  console.log(`[quizall] 🚀 Starting Anthropic call - Model: ${resolvedModel}`);

  try {
    const startTime = Date.now();
    const message = await client.messages.create({
      model: resolvedModel,
      max_tokens: maxTokens || 4096,
      temperature: temperature ?? 0.3,
      system: (system || "") + "\n\nIMPORTANT: Respond with valid JSON only. No markdown, no code fences, no explanation outside the JSON.",
      messages: [
        { role: "user", content: user }
      ],
    });
    const duration = Date.now() - startTime;

    const content = message.content?.[0]?.text || "{}";
    const inputTokens = message.usage?.input_tokens || 0;
    const outputTokens = message.usage?.output_tokens || 0;
    const totalTokens = inputTokens + outputTokens;
    const stopReason = message.stop_reason || "";

    console.log(`[quizall] ✅ Anthropic call succeeded - Duration: ${duration}ms, Response: ${content.length} chars, Tokens: ${totalTokens} (in:${inputTokens} out:${outputTokens})${stopReason ? `, stop:${stopReason}` : ""}`);
    if (stopReason === "max_tokens") {
      console.warn("[quizall] ⚠️  Anthropic response truncated (max_tokens) — attempting JSON repair");
    }

    const parsed = parseJsonLenient(content);

    return {
      data: parsed,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: totalTokens },
      model: resolvedModel,
      completionId: message.id || null,
    };
  } catch (error) {
    console.error(`[quizall] ❌ Anthropic call failed:`, error.message);
    throw error;
  }
}

/**
 * Chat completion that returns Text via Anthropic Claude
 *
 * @returns {{ text: string, usage: object, model: string, completionId: string|null, similarity: number }}
 */
export async function chatTextAnthropic({ system, user, model, apiKey: overrideKey, maxTokens, temperature, minSimilarity, maxRetries }) {
  let client = anthropicClient;

  if (overrideKey) {
    client = new Anthropic({ apiKey: overrideKey });
  }

  if (!client) {
    console.error("[quizall] ❌ Anthropic call blocked: client not initialized (ANTHROPIC_API_KEY not set)");
    throw new AnthropicDisabledError();
  }

  const resolvedModel = model || "claude-haiku-4-5-20251001";
  console.log(`[quizall] 🚀 Starting Anthropic call - Model: ${resolvedModel} (Text Mode)`);

  try {
    const startTime = Date.now();
    const message = await client.messages.create({
      model: resolvedModel,
      max_tokens: maxTokens || 4096,
      temperature: temperature ?? 0.3,
      system: system || "",
      messages: [
        { role: "user", content: user }
      ],
    });
    const duration = Date.now() - startTime;

    const content = message.content?.[0]?.text || "";
    const inputTokens = message.usage?.input_tokens || 0;
    const outputTokens = message.usage?.output_tokens || 0;
    const totalTokens = inputTokens + outputTokens;

    console.log(`[quizall] ✅ Anthropic call succeeded - Duration: ${duration}ms, Response: ${content.length} chars, Tokens: ${totalTokens} (in:${inputTokens} out:${outputTokens})`);

    if (minSimilarity && maxRetries && maxRetries > 0) {
      console.log(`[quizall] ⚠️ Similarity check not implemented for Anthropic (returns 0). minSimilarity=${minSimilarity}, maxRetries=${maxRetries}`);
    }

    return {
      text: content,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: totalTokens },
      model: resolvedModel,
      completionId: message.id || null,
      similarity: 0,
    };
  } catch (error) {
    console.error(`[quizall] ❌ Anthropic call failed:`, error.message);
    throw error;
  }
}
