import type { Db } from "../db";
import { isUniqueViolation } from "../db";
import { AppError } from "../errors";
import { getSettings, type AppSettings } from "../settings";
import { affordableOutputTokens, customerCharge, providerCostPoisha } from "../pricing";
import { ledger } from "../audit";
import { findUsableShare } from "./groups";
import { ProviderError, SYSTEM_PROMPT, type AIProvider, type ChatTurn } from "../ai/provider";

export type FundingSource = "WALLET" | "GROUP";

export const MAX_MESSAGE_CHARS = 8000;
const HISTORY_LIMIT = 20;
const STALE_MS = 10 * 60 * 1000;
/** Max replies being generated at once per customer (protects your API budget and rate limits). */
export const MAX_PARALLEL = 3;

export type PreparedChat = {
  requestId: string;
  conversationId: string;
  assistantMessageId: string;
  source: FundingSource;
  reserved: number;
  maxTokens: number;
  model: string;
  effort: string;
  history: ChatTurn[];
  available: number; // balance after reservation
};

export type DuplicateChat = {
  duplicate: true;
  requestId: string;
  status: string;
  conversationId: string;
  content: string | null;
  charged: number;
};

function markupFor(settings: AppSettings, source: FundingSource) {
  return source === "WALLET" ? settings.walletMarkupPercent : settings.groupMarkupPercent;
}

async function buildHistory(db: Db, conversationId: string | null, text: string): Promise<ChatTurn[]> {
  const turns: ChatTurn[] = [];
  if (conversationId) {
    const prior = await db.message.findMany({
      where: { conversationId, status: "COMPLETE", content: { not: "" } },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
    });
    for (const m of prior.reverse()) {
      const role = m.role === "assistant" ? "assistant" : "user";
      const prev = turns[turns.length - 1];
      if (prev && prev.role === role) prev.content += "\n\n" + m.content;
      else turns.push({ role, content: m.content });
    }
    while (turns.length && turns[0].role !== "user") turns.shift();
  }
  const prev = turns[turns.length - 1];
  if (prev && prev.role === "user") prev.content += "\n\n" + text;
  else turns.push({ role: "user", content: text });
  return turns;
}

/**
 * Validate, choose funding, reserve the maximum permitted charge and create the
 * request + messages atomically. Throws AppError for user-facing problems.
 */
export async function prepareChat(
  db: Db,
  provider: AIProvider,
  input: {
    userId: string;
    conversationId?: string | null;
    clientRequestId: string;
    text: string;
    source: FundingSource;
    shareId?: string | null;
    now: Date;
  },
): Promise<PreparedChat | DuplicateChat> {
  const text = input.text.trim();
  if (!text) throw new AppError("EMPTY", "কিছু লিখুন।");
  if (text.length > MAX_MESSAGE_CHARS) throw new AppError("TOO_LONG", `বার্তা ${MAX_MESSAGE_CHARS} অক্ষরের বেশি হতে পারবে না।`);
  if (!/^[A-Za-z0-9-]{8,64}$/.test(input.clientRequestId)) throw new AppError("BAD_REQUEST_ID", "Invalid request id");
  if (input.source !== "WALLET" && input.source !== "GROUP") throw new AppError("BAD_SOURCE", "খরচের উৎস বেছে নিন।");

  // Idempotent retry: same clientRequestId never generates or charges twice.
  const existing = await db.chatRequest.findUnique({
    where: { userId_clientRequestId: { userId: input.userId, clientRequestId: input.clientRequestId } },
  });
  if (existing) return duplicateOf(db, existing);

  await releaseStale(db, input.now, input.userId);
  const inFlight = await db.chatRequest.count({ where: { userId: input.userId, status: "RESERVED" } });
  if (inFlight >= MAX_PARALLEL) throw new AppError("BUSY", "আগের উত্তর শেষ হওয়া পর্যন্ত একটু অপেক্ষা করুন।", 429);

  let conversationId: string | null = null;
  if (input.conversationId) {
    const conv = await db.conversation.findFirst({ where: { id: input.conversationId, userId: input.userId } });
    if (!conv) throw new AppError("NOT_FOUND", "চ্যাট পাওয়া যায়নি।", 404);
    conversationId = conv.id;
  }

  const settings = await getSettings(db);
  const markup = markupFor(settings, input.source);

  // Funding source checks (server-side, every request).
  let walletId: string | null = null;
  let shareId: string | null = null;
  let available = 0;
  if (input.source === "WALLET") {
    const w = await db.wallet.findUnique({ where: { userId: input.userId } });
    if (!w) throw new AppError("INSUFFICIENT", "আপনার ওয়ালেটে ব্যালান্স নেই। আগে টপ-আপ করুন।", 402);
    walletId = w.id;
    available = w.balance;
  } else {
    const { inSlot, all } = await findUsableShare(db, input.userId, input.now, input.shareId ?? undefined);
    if (!all.length) throw new AppError("NO_GROUP", "আপনার কোনো চালু গ্রুপ পাস নেই।", 403);
    if (!inSlot) {
      const next = all.map((a) => a.window).filter(Boolean).sort((a, b) => a!.start.getTime() - b!.start.getTime())[0];
      throw new AppError("OUT_OF_SLOT", "এখন আপনার গ্রুপের সময় নয়। চাইলে নিজের ওয়ালেট ব্যবহার করতে পারেন।", 403, {
        nextSlotStart: next?.start.toISOString() ?? null,
      });
    }
    shareId = inSlot.shareId;
    available = inSlot.remaining;
  }

  const history = await buildHistory(db, conversationId, text);
  const counted = await provider.countTokens({ model: settings.modelId, system: SYSTEM_PROMPT, messages: history });
  const inputTokens = Math.ceil(counted * 1.05) + 8; // small safety margin
  const maxTokens = affordableOutputTokens(settings.rates, markup, available, inputTokens, settings.maxOutputTokens);
  if (maxTokens < settings.minOutputTokens) {
    throw new AppError(
      "INSUFFICIENT",
      input.source === "WALLET"
        ? "ওয়ালেটে যথেষ্ট ব্যালান্স নেই। টপ-আপ করুন।"
        : "আপনার গ্রুপ অ্যালাওয়েন্স প্রায় শেষ। চাইলে নিজের ওয়ালেট ব্যবহার করুন।",
      402,
    );
  }
  const reserve = customerCharge(settings.rates, markup, inputTokens, maxTokens);

  try {
    return await db.$transaction(async (tx) => {
      // Atomic conditional hold: fails instead of going negative under concurrency.
      if (walletId) {
        const held = await tx.wallet.updateMany({
          where: { id: walletId, balance: { gte: reserve } },
          data: { balance: { decrement: reserve }, reserved: { increment: reserve } },
        });
        if (held.count === 0) throw new AppError("INSUFFICIENT", "ওয়ালেটে যথেষ্ট ব্যালান্স নেই। টপ-আপ করুন।", 402);
      } else {
        const held = await tx.cycleShare.updateMany({
          where: { id: shareId!, status: "PAID", remaining: { gte: reserve } },
          data: { remaining: { decrement: reserve }, reserved: { increment: reserve } },
        });
        if (held.count === 0) throw new AppError("INSUFFICIENT", "আপনার গ্রুপ অ্যালাওয়েন্স যথেষ্ট নেই।", 402);
      }

      let convId = conversationId;
      if (!convId) {
        const conv = await tx.conversation.create({
          data: { userId: input.userId, title: text.replace(/\s+/g, " ").slice(0, 48) },
        });
        convId = conv.id;
      } else {
        await tx.conversation.update({ where: { id: convId }, data: { updatedAt: input.now } });
      }
      const req = await tx.chatRequest.create({
        data: {
          userId: input.userId,
          clientRequestId: input.clientRequestId,
          conversationId: convId,
          source: input.source,
          walletId,
          shareId,
          provider: provider.name,
          model: settings.modelId,
          reserved: reserve,
          maxTokens,
          createdAt: input.now,
        },
      });
      const userMsg = await tx.message.create({
        data: { conversationId: convId, role: "user", content: text, requestId: req.id, createdAt: input.now },
      });
      const asst = await tx.message.create({
        data: {
          conversationId: convId,
          role: "assistant",
          content: "",
          status: "STREAMING",
          fundingSource: input.source,
          requestId: req.id,
          createdAt: new Date(input.now.getTime() + 1),
        },
      });
      await tx.chatRequest.update({ where: { id: req.id }, data: { userMessageId: userMsg.id, assistantMessageId: asst.id } });
      return {
        requestId: req.id,
        conversationId: convId,
        assistantMessageId: asst.id,
        source: input.source,
        reserved: reserve,
        maxTokens,
        model: settings.modelId,
        effort: settings.effort,
        history,
        available: available - reserve,
      };
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      const dup = await db.chatRequest.findUnique({
        where: { userId_clientRequestId: { userId: input.userId, clientRequestId: input.clientRequestId } },
      });
      if (dup) return duplicateOf(db, dup);
    }
    throw e;
  }
}

async function duplicateOf(db: Db, r: { id: string; status: string; conversationId: string; assistantMessageId: string | null; charged: number }): Promise<DuplicateChat> {
  const msg = r.assistantMessageId ? await db.message.findUnique({ where: { id: r.assistantMessageId } }) : null;
  return { duplicate: true, requestId: r.id, status: r.status, conversationId: r.conversationId, content: msg?.content ?? null, charged: r.charged };
}

export type SettleResult = { charged: number; remaining: number; status: string; alreadySettled?: boolean };

/**
 * Reconcile a reservation with actual usage. Idempotent: only the first call
 * transitions RESERVED → COMPLETED/FAILED; unused funds are released.
 */
export async function settleChat(
  db: Db,
  input: {
    requestId: string;
    inputTokens: number;
    outputTokens: number;
    content: string;
    ok: boolean;
    error?: string;
    now: Date;
  },
): Promise<SettleResult> {
  const settings = await getSettings(db);
  return db.$transaction(async (tx) => {
    const req = await tx.chatRequest.findUniqueOrThrow({ where: { id: input.requestId } });
    const source = req.source as FundingSource;
    // If nothing was generated, the customer pays nothing.
    const billable = input.ok || input.outputTokens > 0 || input.content.length > 0;
    const inTok = billable ? input.inputTokens : 0;
    const outTok = billable ? input.outputTokens : 0;
    const fullCharge = customerCharge(settings.rates, markupFor(settings, source), inTok, outTok);
    const charged = Math.min(fullCharge, req.reserved);
    const absorbed = fullCharge - charged;
    const cost = providerCostPoisha(settings.rates, input.inputTokens, input.outputTokens);
    const status = input.ok ? "COMPLETED" : billable ? "FAILED" : "RELEASED";

    const upd = await tx.chatRequest.updateMany({
      where: { id: req.id, status: "RESERVED" },
      data: {
        status,
        charged,
        absorbed,
        providerCost: cost,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        error: input.error ?? null,
        settledAt: input.now,
      },
    });
    if (upd.count === 0) {
      return { charged: req.charged, remaining: await remainingFor(tx, req), status: req.status, alreadySettled: true };
    }
    const refund = req.reserved - charged;
    let remaining = 0;
    if (req.walletId) {
      const w = await tx.wallet.update({
        where: { id: req.walletId },
        data: { reserved: { decrement: req.reserved }, balance: { increment: refund } },
      });
      remaining = w.balance;
      if (charged > 0) {
        await tx.walletTransaction.create({
          data: {
            walletId: w.id,
            type: "CHAT_CHARGE",
            amount: -charged,
            balanceAfter: w.balance,
            refType: "ChatRequest",
            refId: req.id,
            note: `${input.inputTokens} in / ${input.outputTokens} out tokens`,
          },
        });
      }
    } else if (req.shareId) {
      const s = await tx.cycleShare.update({
        where: { id: req.shareId },
        data: { reserved: { decrement: req.reserved }, remaining: { increment: refund } },
      });
      remaining = s.remaining;
    }
    if (req.assistantMessageId) {
      await tx.message.update({
        where: { id: req.assistantMessageId },
        data: {
          content: input.content,
          status: input.ok ? "COMPLETE" : "FAILED",
          charge: charged,
        },
      });
    }
    await ledger(tx, {
      key: `usage:${req.id}`,
      kind: source === "WALLET" ? "WALLET_USAGE" : "GROUP_USAGE",
      amount: charged,
      userId: req.userId,
      refType: "ChatRequest",
      refId: req.id,
    });
    await ledger(tx, { key: `cost:${req.id}`, kind: "PROVIDER_COST", amount: cost, userId: req.userId, refType: "ChatRequest", refId: req.id });
    return { charged, remaining, status };
  });
}

async function remainingFor(tx: Parameters<Parameters<Db["$transaction"]>[0]>[0], req: { walletId: string | null; shareId: string | null }) {
  if (req.walletId) return (await tx.wallet.findUnique({ where: { id: req.walletId } }))?.balance ?? 0;
  if (req.shareId) return (await tx.cycleShare.findUnique({ where: { id: req.shareId } }))?.remaining ?? 0;
  return 0;
}

/** Release reservations stuck by a crashed process (no usage known → customer is not charged). */
export async function releaseStale(db: Db, now: Date, userId?: string) {
  const stale = await db.chatRequest.findMany({
    where: { status: "RESERVED", createdAt: { lt: new Date(now.getTime() - STALE_MS) }, ...(userId ? { userId } : {}) },
    select: { id: true, assistantMessageId: true },
    take: 50,
  });
  for (const r of stale) {
    const msg = r.assistantMessageId ? await db.message.findUnique({ where: { id: r.assistantMessageId } }) : null;
    await settleChat(db, { requestId: r.id, inputTokens: 0, outputTokens: 0, content: msg?.content ?? "", ok: false, error: "stale_reservation", now });
  }
  return stale.length;
}

export type StreamEvent =
  | { type: "meta"; requestId: string; conversationId: string; source: FundingSource; reserved: number; maxTokens: number; providerLabel: string }
  | { type: "delta"; text: string }
  | { type: "done"; charged: number; remaining: number; status: string }
  | { type: "error"; message: string; charged: number; remaining: number };

/** Run generation to completion (even if the client disconnects) and settle exactly once. */
export async function runChat(db: Db, provider: AIProvider, p: PreparedChat, emit: (e: StreamEvent) => void, clock: () => Date) {
  emit({
    type: "meta",
    requestId: p.requestId,
    conversationId: p.conversationId,
    source: p.source,
    reserved: p.reserved,
    maxTokens: p.maxTokens,
    providerLabel: provider.label,
  });
  let content = "";
  let lastFlush = Date.now();
  const flush = async () => {
    lastFlush = Date.now();
    await db.message.update({ where: { id: p.assistantMessageId }, data: { content } }).catch(() => {});
  };
  try {
    const result = await provider.generate(
      { model: p.model, system: SYSTEM_PROMPT, messages: p.history, maxTokens: p.maxTokens, effort: p.effort },
      (t) => {
        content += t;
        emit({ type: "delta", text: t });
        if (Date.now() - lastFlush > 1500) void flush();
      },
    );
    if (result.stopReason === "max_tokens") content += "\n\n_(উত্তরটি সীমার কারণে এখানে থেমেছে)_";
    const s = await settleChat(db, { requestId: p.requestId, inputTokens: result.inputTokens, outputTokens: result.outputTokens, content, ok: true, now: clock() });
    emit({ type: "done", charged: s.charged, remaining: s.remaining, status: s.status });
  } catch (e) {
    const pe = e instanceof ProviderError ? e : new ProviderError(e instanceof Error ? e.message : "unknown");
    console.error("chat generation failed", p.requestId, pe.message);
    const s = await settleChat(db, {
      requestId: p.requestId,
      inputTokens: pe.inputTokens,
      outputTokens: pe.outputTokens,
      content,
      ok: false,
      error: pe.message,
      now: clock(),
    });
    emit({
      type: "error",
      message:
        s.charged > 0
          ? "উত্তর তৈরির মাঝপথে সমস্যা হয়েছে। যতটুকু তৈরি হয়েছে শুধু ততটুকুর খরচ কাটা হয়েছে।"
          : "AI সার্ভিসে সমস্যা হয়েছে। আপনার কোনো টাকা কাটা হয়নি। একটু পরে আবার চেষ্টা করুন।",
      charged: s.charged,
      remaining: s.remaining,
    });
  }
}

/** Owner-only conversation access. Returns null for anyone else (callers respond 404). */
export async function getConversationForUser(db: Db, userId: string, conversationId: string) {
  return db.conversation.findFirst({
    where: { id: conversationId, userId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}
