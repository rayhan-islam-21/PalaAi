import { describe, expect, it } from "vitest";
import { groupQuote, customerCharge, providerCostPoisha, affordableOutputTokens } from "@/lib/pricing";
import { currentOrNextWindow, isWithinSlot, validateSchedule, DEFAULT_SCHEDULE_4, DEFAULT_SCHEDULE_5 } from "@/lib/slots";
import { parseTaka } from "@/lib/money";
import { dhaka } from "./helpers";

describe("group pricing", () => {
  it("matches the published calculator", () => {
    const q4 = groupQuote(240000, 4, 2500);
    expect(q4.sharePerMember).toBe(60000);
    expect(q4.pricePerMember).toBe(62500);
    const q5 = groupQuote(240000, 5, 2500);
    expect(q5.sharePerMember).toBe(48000);
    expect(q5.pricePerMember).toBe(50500);
  });
  it("rejects other seat counts", () => {
    expect(() => groupQuote(240000, 3, 2500)).toThrow();
  });
});

describe("usage charges", () => {
  const rates = { inputUsdPerMTok: 4, outputUsdPerMTok: 20, usdToBdt: 122 };
  it("computes provider cost from tokens", () => {
    // 1M input tokens at $4 × 122 = ৳488 = 48800 poisha
    expect(providerCostPoisha(rates, 1_000_000, 0)).toBe(48800);
    // 1M output at $20 × 122 = ৳2440
    expect(providerCostPoisha(rates, 0, 1_000_000)).toBe(244000);
    // rounds up
    expect(providerCostPoisha(rates, 1, 0)).toBe(1);
  });
  it("applies markup", () => {
    expect(customerCharge(rates, 20, 1_000_000, 0)).toBe(58560);
  });
  it("caps output tokens to what is affordable", () => {
    const max = affordableOutputTokens(rates, 20, 1000, 100, 100000);
    expect(customerCharge(rates, 20, 100, max)).toBeLessThanOrEqual(1000);
    expect(customerCharge(rates, 20, 100, max + 1)).toBeGreaterThan(1000);
    expect(affordableOutputTokens(rates, 20, 0, 100, 4096)).toBe(0);
  });
  it("parses taka input", () => {
    expect(parseTaka("625")).toBe(62500);
    expect(parseTaka("2,400.5")).toBe(240050);
    expect(parseTaka("abc")).toBeNull();
  });
});

describe("Dhaka slots with injected clock", () => {
  const slot = { start: "09:00", end: "12:00" };
  it("detects inside / outside", () => {
    expect(isWithinSlot(slot, dhaka("09:00"))).toBe(true);
    expect(isWithinSlot(slot, dhaka("11:59"))).toBe(true);
    expect(isWithinSlot(slot, dhaka("12:00"))).toBe(false);
    expect(isWithinSlot(slot, dhaka("08:59"))).toBe(false);
  });
  it("finds the next window", () => {
    const before = currentOrNextWindow(slot, dhaka("07:00"));
    expect(before.active).toBe(false);
    expect(before.start.toISOString()).toBe(dhaka("09:00").toISOString());
    const after = currentOrNextWindow(slot, dhaka("13:00"));
    expect(after.start.toISOString()).toBe(dhaka("09:00", 2).toISOString());
    const during = currentOrNextWindow(slot, dhaka("10:00"));
    expect(during.active).toBe(true);
    expect(during.end.toISOString()).toBe(dhaka("12:00").toISOString());
  });
  it("handles Dhaka day boundary (UTC evening)", () => {
    const late = { start: "19:00", end: "21:30" };
    expect(isWithinSlot(late, dhaka("21:00"))).toBe(true); // 15:00 UTC
    expect(isWithinSlot({ start: "00:00", end: "02:00" }, new Date(Date.UTC(2026, 11, 1, 18, 30)))).toBe(true); // 00:30 Dhaka
  });
  it("validates schedules", () => {
    expect(validateSchedule(DEFAULT_SCHEDULE_4, 4)).toBeNull();
    expect(validateSchedule(DEFAULT_SCHEDULE_5, 5)).toBeNull();
    expect(validateSchedule(DEFAULT_SCHEDULE_4, 5)).toMatch(/exactly 5/);
    expect(validateSchedule([{ start: "09:00", end: "12:00" }, { start: "11:00", end: "13:00" }], 2)).toMatch(/overlap/);
    expect(validateSchedule([{ start: "12:00", end: "09:00" }], 1)).toMatch(/end after/);
  });
});
