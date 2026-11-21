"use server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { currentTime } from "@/lib/clock";
import { errorMessage } from "@/lib/errors";
import { isDemoMode } from "@/lib/env";
import { audit } from "@/lib/audit";
import { approveClaim, rejectClaim, completeRefund, normalizeMsisdn, PROVIDERS } from "@/lib/services/payments";
import { cancelGroup } from "@/lib/services/groups";
import { releaseStale } from "@/lib/services/chat";
import { FEE_MAX, FEE_MIN, getSettings } from "@/lib/settings";
import { MODEL_PRICES } from "@/lib/models";
import { countForModel } from "@/lib/token-count";
import { customerCharge, providerCostPoisha } from "@/lib/pricing";
import { parseTaka } from "@/lib/money";
import { validateSchedule, type Slot } from "@/lib/slots";
import type { ActionState } from "@/components/ActionForm";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function approvePaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  try {
    const r = await approveClaim(prisma, { adminId: admin.id, claimId: str(fd, "claimId"), note: str(fd, "note"), now: await currentTime(prisma) });
    revalidatePath("/admin/payments");
    const msg = { WALLET_CREDITED: "Approved — wallet credited.", SHARE_PAID: r.activated ? "Approved — share paid. Group is now ACTIVE." : "Approved — share marked paid.", REFUND_CREATED: "Approved — share no longer applicable, a refund was created." }[r.outcome];
    return { ok: msg };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function rejectPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  try {
    await rejectClaim(prisma, { adminId: admin.id, claimId: str(fd, "claimId"), note: str(fd, "note"), now: await currentTime(prisma) });
    revalidatePath("/admin/payments");
    return { ok: "Rejected." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function completeRefundAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  try {
    await completeRefund(prisma, {
      adminId: admin.id,
      refundId: str(fd, "refundId"),
      provider: str(fd, "provider"),
      payoutRef: str(fd, "payoutRef"),
      note: str(fd, "note"),
      now: await currentTime(prisma),
    });
    revalidatePath("/admin/refunds");
    return { ok: "Refund marked as sent." };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function adminCancelGroupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  try {
    const r = await cancelGroup(prisma, { actorId: admin.id, isAdmin: true, groupId: str(fd, "groupId"), reason: str(fd, "reason") || "Cancelled by admin", now: await currentTime(prisma) });
    revalidatePath("/admin/groups");
    return { ok: `Cancelled. ${r.refunds.length} refund(s) created.` };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

function parseSchedule(text: string): Slot[] {
  return text
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [start, end] = l.split(/\s*[-–]\s*/);
      return { start: start?.padStart(5, "0"), end: end?.padStart(5, "0") };
    });
}

export async function saveSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const pool = parseTaka(str(fd, "poolAmount"));
  const fee = parseTaka(str(fd, "serviceFee"));
  if (pool === null || pool < 10000) return { error: "Pool must be at least ৳100." };
  if (fee === null || fee < FEE_MIN || fee > FEE_MAX) return { error: "Service fee must be between ৳20 and ৳30 per member." };
  const s4 = parseSchedule(str(fd, "schedule4"));
  const s5 = parseSchedule(str(fd, "schedule5"));
  const e4 = validateSchedule(s4, 4);
  const e5 = validateSchedule(s5, 5);
  if (e4) return { error: `4-person schedule: ${e4}` };
  if (e5) return { error: `5-person schedule: ${e5}` };
  const num = (k: string) => Number(str(fd, k));
  const inPrice = num("inputUsdPerMTok"), outPrice = num("outputUsdPerMTok"), rate = num("usdToBdt");
  if (!(inPrice > 0) || !(outPrice > 0) || !(rate > 0)) return { error: "Prices and exchange rate must be positive numbers." };
  const wm = Math.round(num("walletMarkupPercent")), gm = Math.round(num("groupMarkupPercent"));
  if (!(wm >= 0 && wm <= 200) || !(gm >= 0 && gm <= 200)) return { error: "Markups must be 0–200%." };
  const maxT = Math.round(num("maxOutputTokens")), minT = Math.round(num("minOutputTokens"));
  if (!(maxT >= 256 && maxT <= 64000) || !(minT >= 16 && minT <= maxT)) return { error: "Token limits invalid (max 256–64000, min 16–max)." };
  const days = Math.round(num("cycleDays"));
  if (!(days >= 1 && days <= 31)) return { error: "Cycle days must be 1–31." };
  const effort = str(fd, "effort");
  if (!["", "low", "medium", "high", "xhigh", "max"].includes(effort)) return { error: "Invalid effort." };
  const modelId = str(fd, "modelId");
  if (!/^[a-z0-9.\-]{3,64}$/.test(modelId)) return { error: "Invalid model id." };
  const topups = str(fd, "topupAmounts").split(",").map((x) => parseTaka(x.trim())).filter((x): x is number => x !== null && x >= 1000);
  if (topups.length === 0) return { error: "Enter at least one top-up amount (৳10 or more)." };

  const data = {
    poolAmount: pool, serviceFeePerMember: fee, cycleDays: days, schedule4: s4, schedule5: s5, modelId,
    inputUsdPerMTok: new Prisma.Decimal(inPrice), outputUsdPerMTok: new Prisma.Decimal(outPrice), usdToBdt: new Prisma.Decimal(rate),
    walletMarkupPercent: wm, groupMarkupPercent: gm, maxOutputTokens: maxT, minOutputTokens: minT, effort, topupAmounts: topups,
  };
  await prisma.setting.update({ where: { id: 1 }, data });
  await audit(prisma, admin.id, "settings.update", "Setting", "1", JSON.parse(JSON.stringify(data)));
  revalidatePath("/", "layout");
  return { ok: "Saved. New prices apply to newly created groups and renewals; existing cycles keep their locked quote." };
}

export async function savePaymentMethodAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const provider = str(fd, "provider");
  if (!(PROVIDERS as readonly string[]).includes(provider)) return { error: "Unknown provider" };
  const enabled = fd.get("enabled") === "on";
  const raw = str(fd, "receiverNumber");
  const number = raw ? normalizeMsisdn(raw) : "";
  if (raw && !number) return { error: "Receiving number must be a valid Bangladeshi mobile number (01XXXXXXXXX)." };
  if (enabled && !number) return { error: "Set a receiving number before enabling." };
  const accountType = ["Personal", "Merchant", "Agent"].includes(str(fd, "accountType")) ? str(fd, "accountType") : "Personal";
  const data = { enabled, receiverNumber: number ?? "", accountType, instructions: str(fd, "instructions").slice(0, 1000), isDemo: false };
  await prisma.paymentMethod.upsert({ where: { provider }, update: data, create: { provider, ...data } });
  await audit(prisma, admin.id, "paymentMethod.update", "PaymentMethod", provider, data);
  revalidatePath("/admin/settings");
  return { ok: `${provider} saved${enabled ? " and enabled" : " (disabled)"}.` };
}

export async function setDemoClockAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!isDemoMode()) return { error: "Demo clock is only available in demo mode." };
  const v = str(fd, "demoNow");
  let demoNow: Date | null = null;
  if (v) {
    // datetime-local input is interpreted as Asia/Dhaka time.
    demoNow = new Date(`${v}:00+06:00`);
    if (isNaN(demoNow.getTime())) return { error: "Invalid time" };
  }
  await prisma.setting.update({ where: { id: 1 }, data: { demoNow, demoSetAt: demoNow ? new Date() : null } });
  await audit(prisma, admin.id, "demo.clock", "Setting", "1", { demoNow: demoNow?.toISOString() ?? null });
  revalidatePath("/", "layout");
  return { ok: demoNow ? `Simulated clock set to ${v} (Dhaka).` : "Using real time." };
}

export async function releaseStaleAction(_: ActionState): Promise<ActionState> {
  await requireAdmin();
  const n = await releaseStale(prisma, await currentTime(prisma));
  return { ok: `Released ${n} stale reservation(s).` };
}

export type TokenCalcState = {
  error?: string;
  question?: string;
  answer?: string;
  exact?: boolean;
  usdToBdt?: number;
  markup?: number;
  words?: { question: number; answer: number };
  chars?: { question: number; answer: number };
  history?: number;
  rows?: {
    label: string;
    input: number;
    output: number;
    question: number;
    answer: number;
    system: number;
    costPoisha: number;
    cachedCostPoisha: number;
    chargePoisha: number;
    cachedChargePoisha: number;
  }[];
} | null;

export async function tokenCalcAction(_: TokenCalcState, fd: FormData): Promise<TokenCalcState> {
  await requireAdmin();
  const question = String(fd.get("question") ?? "").slice(0, 50000);
  const answer = String(fd.get("answer") ?? "").slice(0, 50000);
  const history = Math.max(0, Math.min(200000, Math.round(Number(fd.get("history") ?? 0) || 0)));
  if (!question.trim() && !answer.trim()) return { error: "Type a customer message and/or a sample AI answer." };
  const keep = { question, answer, history };
  const s = await getSettings(prisma);
  const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);
  try {
    const rows = await Promise.all(
      MODEL_PRICES.map(async (m) => {
        const c = await countForModel(m.id, question, answer);
        const input = c.system + history + c.question;
        const rates = { inputUsdPerMTok: m.input, outputUsdPerMTok: m.output, usdToBdt: s.rates.usdToBdt };
        const cost = providerCostPoisha(rates, input, c.answer);
        const charge = customerCharge(rates, s.walletMarkupPercent, input, c.answer);
        // With prompt caching, the earlier chat (history) is billed at the cache-read price.
        const microUsdCached = (c.system + c.question) * m.input + history * m.cacheRead + c.answer * m.output;
        const cachedCost = Math.ceil((microUsdCached * s.rates.usdToBdt) / 10000);
        const cachedCharge = Math.ceil((cachedCost * (100 + s.walletMarkupPercent)) / 100);
        return {
          label: m.label, input, output: c.answer, question: c.question, answer: c.answer, system: c.system,
          costPoisha: cost, cachedCostPoisha: cachedCost, chargePoisha: charge, cachedChargePoisha: cachedCharge, exact: c.exact,
        };
      }),
    );
    return {
      ...keep,
      exact: rows.every((r) => r.exact),
      usdToBdt: s.rates.usdToBdt,
      markup: s.walletMarkupPercent,
      words: { question: words(question), answer: words(answer) },
      chars: { question: [...question].length, answer: [...answer].length },
      history,
      rows,
    };
  } catch (e) {
    return { ...keep, error: `Token counting failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
