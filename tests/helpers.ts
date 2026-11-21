import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import type { AIProvider, GenerateRequest, GenerateResult } from "@/lib/ai/provider";
import { ProviderError } from "@/lib/ai/provider";

export const db = prisma;

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
  await getSettings(prisma);
  // Bonuses are tested explicitly in bonus.test.ts; keep other tests' arithmetic simple.
  await prisma.setting.update({ where: { id: 1 }, data: { firstTopupBonusPercent: 0, packs: [{ amount: 10000, bonusPercent: 0, name: "Mini" }, { amount: 25000, bonusPercent: 0, name: "Plus" }, { amount: 50000, bonusPercent: 0, name: "Pro" }] } });
  await prisma.paymentMethod.create({ data: { provider: "BKASH", enabled: true, receiverNumber: "01700000000", instructions: "test" } });
}

let n = 0;
export async function makeUser(name = "user") {
  n++;
  return prisma.user.create({ data: { id: randomUUID(), name: `${name}${n}`, email: `${name}${n}-${randomUUID()}@t.test` } });
}

export async function makeAdmin() {
  return prisma.user.create({ data: { id: randomUUID(), name: "admin", email: `admin-${randomUUID()}@t.test`, role: "ADMIN" } });
}

let txn = 0;
export function txnId() {
  txn++;
  return `TX${Date.now().toString(36).toUpperCase()}${txn}`;
}

/** Dhaka local "HH:MM" on 2026-12-01 as a UTC Date. */
export function dhaka(hhmm: string, day = 1) {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 11, day, h - 6, m));
}

/** Deterministic provider with fixed usage; can be told to fail. */
export class FakeProvider implements AIProvider {
  name = "mock" as const;
  label = "fake";
  calls = 0;
  constructor(
    public opts: { input?: number; output?: number; failBefore?: boolean; failMid?: boolean; text?: string; delay?: number } = {},
  ) {}
  async countTokens() {
    return this.opts.input ?? 100;
  }
  async generate(req: GenerateRequest, onText: (t: string) => void): Promise<GenerateResult> {
    this.calls++;
    if (this.opts.delay) await new Promise((r) => setTimeout(r, this.opts.delay));
    if (this.opts.failBefore) throw new ProviderError("boom", 0, 0, true);
    onText(this.opts.text ?? "hello");
    if (this.opts.failMid) throw new ProviderError("mid", this.opts.input ?? 100, 20);
    return { inputTokens: this.opts.input ?? 100, outputTokens: Math.min(this.opts.output ?? 200, req.maxTokens), stopReason: "end_turn" };
  }
}

export const rid = () => randomUUID();
