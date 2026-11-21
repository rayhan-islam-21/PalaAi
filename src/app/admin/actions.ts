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
import { adminAdjustWallet, adminResetPassword, adminSetDisabled } from "@/lib/services/account";
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
    const msg = e instanceof Error ? e.message : String(e);
    if (/401|authentication_error|invalid.*(key|token)/i.test(msg)) {
      return { ...keep, error: "Anthropic rejected the API key (401). In Vercel → Settings → Environment Variables, replace ANTHROPIC_API_KEY with a valid key from console.anthropic.com → API Keys (starts with sk-ant-api…), then Redeploy. Live chat fails with the same error until this is fixed." };
    }
    return { ...keep, error: `Token counting failed: ${msg}` };
  }
}

/** Simple wallet-only settings: model (prices from the published table), exchange rate, markup, top-ups, limits. */
export async function saveBusinessSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const num = (k: string) => Number(str(fd, k));
  const choice = str(fd, "model");
  let modelId: string, inPrice: number, outPrice: number;
  const known = MODEL_PRICES.find((m) => m.id === choice);
  if (known) {
    modelId = known.id;
    inPrice = known.input;
    outPrice = known.output;
  } else {
    modelId = str(fd, "customModelId");
    inPrice = num("customInput");
    outPrice = num("customOutput");
    if (!/^[a-z0-9.\-]{3,64}$/.test(modelId)) return { error: "Custom model: enter a valid model ID." };
    if (!(inPrice > 0) || !(outPrice > 0)) return { error: "Custom model: enter input and output prices." };
  }
  const rate = num("usdToBdt");
  if (!(rate >= 50 && rate <= 500)) return { error: "Dollar rate looks wrong (৳ per $1, e.g. 130)." };
  const wm = Math.round(num("walletMarkupPercent"));
  if (!(wm >= 0 && wm <= 200)) return { error: "Markup must be 0–200%." };
  let packs: { amount: number; bonusPercent: number; name: string }[];
  try {
    packs = (JSON.parse(str(fd, "packs") || "[]") as { amount: number; bonusPercent: number; name: string }[]).map((p) => ({
      amount: Math.round(Number(p.amount)),
      bonusPercent: Math.round(Number(p.bonusPercent)),
      name: String(p.name ?? "").trim().slice(0, 20) || "Pack",
    }));
  } catch {
    return { error: "Packs could not be read." };
  }
  if (!packs.length) return { error: "Add at least one pack." };
  if (packs.some((p) => !(p.amount >= 1000 && p.amount <= 10_000_000))) return { error: "Each pack price must be ৳10 or more." };
  if (packs.some((p) => !(p.bonusPercent >= 0 && p.bonusPercent <= 50))) return { error: "Pack bonus must be 0–50%." };
  if (new Set(packs.map((p) => p.amount)).size !== packs.length) return { error: "Two packs have the same price." };
  packs.sort((a, b) => a.amount - b.amount);
  const firstPct = Math.round(num("firstTopupBonusPercent"));
  const firstCap = parseTaka(str(fd, "firstTopupBonusCap") || "0");
  if (!(firstPct >= 0 && firstPct <= 50) || firstCap === null) return { error: "First top-up bonus must be 0–50% with a valid maximum." };
  const maxT = Math.round(num("maxOutputTokens")), minT = Math.round(num("minOutputTokens"));
  if (!(maxT >= 256 && maxT <= 64000) || !(minT >= 16 && minT <= maxT)) return { error: "Reply length limits invalid (max 256–64000, min 16–max)." };
  const effort = str(fd, "effort");
  if (!["", "low", "medium", "high"].includes(effort)) return { error: "Invalid effort." };

  const data = {
    modelId,
    inputUsdPerMTok: new Prisma.Decimal(inPrice),
    outputUsdPerMTok: new Prisma.Decimal(outPrice),
    usdToBdt: new Prisma.Decimal(rate),
    walletMarkupPercent: wm,
    packs,
    topupAmounts: packs.map((p) => p.amount),
    firstTopupBonusPercent: firstPct,
    firstTopupBonusCap: firstCap,
    maxOutputTokens: maxT,
    minOutputTokens: minT,
    effort,
  };
  await prisma.setting.update({ where: { id: 1 }, data });
  await audit(prisma, admin.id, "settings.update", "Setting", "1", JSON.parse(JSON.stringify(data)));
  revalidatePath("/", "layout");
  return { ok: "Saved. New prices apply to every new message from now on." };
}

export async function adjustWalletAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const amt = parseTaka(str(fd, "amount").replace(/^[-−]/, ""));
  if (amt === null || amt === 0) return { error: "Enter an amount in taka, e.g. 50" };
  const sign = str(fd, "direction") === "debit" ? -1 : 1;
  try {
    const w = await adminAdjustWallet(prisma, { adminId: admin.id, userId: str(fd, "userId"), amount: sign * amt, reason: str(fd, "reason") });
    revalidatePath(`/admin/users/${str(fd, "userId")}`);
    return { ok: `Done. New balance ৳${(w.balance / 100).toFixed(2)}.` };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function setUserDisabledAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const disabled = str(fd, "disabled") === "true";
  try {
    await adminSetDisabled(prisma, { adminId: admin.id, userId: str(fd, "userId"), disabled });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/admin/users/${str(fd, "userId")}`);
  return { ok: disabled ? "Account blocked and signed out." : "Account unblocked." };
}

export async function resetUserPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const temp = `Pala-${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    await adminResetPassword(prisma, { adminId: admin.id, userId: str(fd, "userId"), password: temp });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { ok: `Temporary password: ${temp} — send it to the customer and ask them to change it in Account.` };
}

export async function saveSupportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const email = str(fd, "supportEmail");
  const wa = str(fd, "supportWhatsapp");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Support email looks wrong." };
  if (wa && !normalizeMsisdn(wa)) return { error: "WhatsApp number must be a Bangladeshi mobile number (01XXXXXXXXX)." };
  const data = { supportEmail: email, supportWhatsapp: wa ? normalizeMsisdn(wa)! : "", businessName: str(fd, "businessName").slice(0, 60) || "Pala AI" };
  await prisma.setting.update({ where: { id: 1 }, data });
  await audit(prisma, admin.id, "settings.support", "Setting", "1", data);
  revalidatePath("/", "layout");
  return { ok: "Support contact saved." };
}
