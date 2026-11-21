import { afterEach, describe, expect, it } from "vitest";
import { getProvider } from "@/lib/ai/provider";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("AI provider selection", () => {
  it("disables chat with a clear message when no key and not in demo mode", () => {
    process.env.PALA_DEMO_MODE = "false";
    process.env.ANTHROPIC_API_KEY = "";
    const r = getProvider();
    expect(r.provider).toBeNull();
    expect(r.reason).toMatch(/বন্ধ/);
  });
  it("uses the real Anthropic provider when a key is set (never mock)", () => {
    process.env.PALA_DEMO_MODE = "false";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(getProvider().provider?.name).toBe("anthropic");
  });
  it("uses the labelled mock only in explicit demo mode", () => {
    process.env.PALA_DEMO_MODE = "true";
    expect(getProvider().provider?.name).toBe("mock");
  });
  it("refuses demo mode on a Vercel production deployment", () => {
    process.env.PALA_DEMO_MODE = "true";
    process.env.VERCEL_ENV = "production";
    process.env.ANTHROPIC_API_KEY = "";
    expect(getProvider().provider).toBeNull();
  });
});
