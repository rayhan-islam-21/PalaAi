import Anthropic from "@anthropic-ai/sdk";
import { anthropicApiKey, hasAnthropicKey } from "./env";
import { SYSTEM_PROMPT } from "./ai/provider";

export type Counted = { model: string; question: number; answer: number; system: number; exact: boolean };

/** Rough fallback when no API key is configured: ~4 Latin chars per token, ~1 token per Bangla/other char. */
export function roughTokens(text: string): number {
  let ascii = 0;
  let other = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) < 128) ascii++;
    else other++;
  }
  return Math.ceil(ascii / 4 + other * 0.9);
}

/**
 * Exact counts from Anthropic's free token-counting endpoint. Each text is counted as a
 * user message and the fixed per-message overhead (measured with a 1-character message) is removed.
 */
export async function countForModel(model: string, question: string, answer: string): Promise<Counted> {
  if (!hasAnthropicKey()) {
    return { model, question: roughTokens(question), answer: roughTokens(answer), system: roughTokens(SYSTEM_PROMPT), exact: false };
  }
  const client = new Anthropic({ apiKey: anthropicApiKey(), maxRetries: 2 });
  const count = (text: string, system?: string) =>
    client.messages.countTokens({ model, ...(system ? { system } : {}), messages: [{ role: "user", content: text || "." }] }).then((r) => r.input_tokens);
  const [base, q, a, withSystem] = await Promise.all([count("."), count(question), count(answer), count(".", SYSTEM_PROMPT)]);
  const strip = (n: number) => Math.max(0, n - base + 1);
  return { model, question: question ? strip(q) : 0, answer: answer ? strip(a) : 0, system: Math.max(0, withSystem - base), exact: true };
}
