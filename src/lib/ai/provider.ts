import Anthropic from "@anthropic-ai/sdk";
import { hasAnthropicKey, isDemoMode } from "../env";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type GenerateRequest = {
  model: string;
  system: string;
  messages: ChatTurn[];
  maxTokens: number;
  effort: string;
};

export type GenerateResult = {
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
};

/** Raised when generation fails; carries any usage the provider already reported. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public inputTokens = 0,
    public outputTokens = 0,
    public retryable = false,
  ) {
    super(message);
  }
}

export interface AIProvider {
  name: "anthropic" | "mock";
  label: string;
  countTokens(req: Omit<GenerateRequest, "maxTokens" | "effort">): Promise<number>;
  generate(req: GenerateRequest, onText: (text: string) => void): Promise<GenerateResult>;
}

/** Conservative token estimate (over-estimates on purpose; used only as a fallback/for the mock). */
export function estimateTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, "utf8") / 2) + 4;
}

function estimateRequest(req: { system: string; messages: ChatTurn[] }): number {
  return estimateTokens(req.system) + req.messages.reduce((a, m) => a + estimateTokens(m.content) + 4, 0);
}

export class AnthropicProvider implements AIProvider {
  name = "anthropic" as const;
  label = "Claude (Anthropic API)";
  private client: Anthropic;

  constructor(apiKey?: string) {
    // SDK retries only the initial request on 429/5xx/connection errors, before any tokens stream.
    this.client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 5 * 60 * 1000 });
  }

  async countTokens(req: Omit<GenerateRequest, "maxTokens" | "effort">): Promise<number> {
    try {
      const r = await this.client.messages.countTokens({ model: req.model, system: req.system, messages: req.messages });
      return r.input_tokens;
    } catch (e) {
      console.warn("countTokens failed, using conservative estimate", e instanceof Error ? e.message : e);
      return estimateRequest(req);
    }
  }

  async generate(req: GenerateRequest, onText: (text: string) => void): Promise<GenerateResult> {
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const effort = ["low", "medium", "high", "xhigh", "max"].includes(req.effort)
        ? (req.effort as "low" | "medium" | "high" | "xhigh" | "max")
        : undefined;
      const stream = this.client.messages.stream({
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: req.messages,
        ...(effort ? { output_config: { effort } } : {}),
      });
      for await (const ev of stream) {
        if (ev.type === "message_start") {
          const u = ev.message.usage;
          inputTokens = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
          outputTokens = u.output_tokens ?? 0;
        } else if (ev.type === "message_delta") {
          if (ev.usage?.output_tokens != null) outputTokens = ev.usage.output_tokens;
        } else if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
          onText(ev.delta.text);
        }
      }
      const final = await stream.finalMessage();
      const u = final.usage;
      if (final.stop_reason === "refusal") {
        onText("\n\n_দুঃখিত, এই অনুরোধে সাহায্য করা সম্ভব হলো না।_");
      }
      return {
        inputTokens: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
        outputTokens: u.output_tokens,
        stopReason: final.stop_reason,
      };
    } catch (e) {
      let retryable = false;
      let msg = e instanceof Error ? e.message : String(e);
      if (e instanceof Anthropic.RateLimitError) {
        retryable = true;
        msg = "rate_limited";
      } else if (e instanceof Anthropic.APIConnectionError) {
        retryable = true;
        msg = "connection_error";
      } else if (e instanceof Anthropic.APIError) {
        retryable = (e.status ?? 0) >= 500;
        msg = `api_error_${e.status ?? "unknown"}`;
      }
      throw new ProviderError(msg, inputTokens, outputTokens, retryable);
    }
  }
}

/**
 * Clearly-labelled mock for local demo mode only. Never selected in production.
 * Special triggers for testing failure paths: "[[fail]]" fails before any output,
 * "[[fail-mid]]" fails after streaming part of the answer.
 */
export class MockProvider implements AIProvider {
  name = "mock" as const;
  label = "ডেমো মক AI (আসল Claude নয়)";
  constructor(private delayMs = 15) {}

  async countTokens(req: Omit<GenerateRequest, "maxTokens" | "effort">) {
    return estimateRequest(req);
  }

  async generate(req: GenerateRequest, onText: (text: string) => void): Promise<GenerateResult> {
    const last = req.messages[req.messages.length - 1]?.content ?? "";
    const inputTokens = estimateRequest(req);
    if (last.includes("[[fail]]")) throw new ProviderError("mock_failure_before_output", 0, 0, true);
    const reply =
      `**[ডেমো মক উত্তর — এটি আসল Claude নয়]**\n\n` +
      `আপনি লিখেছেন: "${last.slice(0, 200)}"\n\n` +
      `এটি স্থানীয় পরীক্ষার জন্য একটি নমুনা উত্তর। বাস্তবে এখানে Anthropic API থেকে Claude-এর উত্তর আসবে।\n\n` +
      "```js\nconsole.log('Pala AI demo');\n```\n";
    const words = reply.split(/(\s+)/);
    let sent = "";
    let tokens = 0;
    for (const w of words) {
      const t = estimateTokens(w) - 4;
      if (tokens + t > req.maxTokens) break;
      tokens += t;
      sent += w;
      onText(w);
      if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
      if (last.includes("[[fail-mid]]") && sent.length > 60) {
        throw new ProviderError("mock_failure_mid_stream", inputTokens, tokens, false);
      }
    }
    return { inputTokens, outputTokens: Math.max(1, tokens), stopReason: "end_turn" };
  }
}

export type ProviderStatus = { provider: AIProvider | null; reason?: string };

export function getProvider(): ProviderStatus {
  if (isDemoMode()) return { provider: new MockProvider() };
  if (hasAnthropicKey()) return { provider: new AnthropicProvider() };
  return { provider: null, reason: "লাইভ চ্যাট এখন বন্ধ আছে (Anthropic API key সেট করা হয়নি)। অনুগ্রহ করে পরে চেষ্টা করুন।" };
}

export const SYSTEM_PROMPT =
  "You are the assistant inside Pala AI, a chat app in Bangladesh powered by Claude through the Anthropic API. " +
  "Reply in the language the user writes in; many users write in Bangla or Banglish. Be clear, friendly and concise, " +
  "and use Markdown for structure and code blocks when helpful.";
