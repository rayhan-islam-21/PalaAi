import type { Db } from "../db";
import { isUniqueViolation } from "../db";
import { AppError } from "../errors";
import { getSettings } from "../settings";
import { audit, ledger } from "../audit";
import { maybeActivate } from "./groups";

export const PROVIDERS = ["BKASH", "NAGAD"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const PROVIDER_LABEL: Record<string, string> = { BKASH: "বিকাশ", NAGAD: "নগদ" };

export function normalizeTxnId(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizeMsisdn(raw: string): string | null {
  let s = raw.trim().replace(/[\s-]/g, "");
  if (s.startsWith("+880")) s = "0" + s.slice(4);
  else if (s.startsWith("880")) s = "0" + s.slice(3);
  return /^01[3-9]\d{8}$/.test(s) ? s : null;
}

export async function enabledMethods(db: Db) {
  return db.paymentMethod.findMany({
    where: { enabled: true, receiverNumber: { not: "" } },
    orderBy: { provider: "asc" },
  });
}

export async function submitClaim(
  db: Db,
  input: {
    userId: string;
    purpose: "WALLET_TOPUP" | "GROUP_SHARE";
    provider: string;
    transactionId: string;
    senderNumber: string;
    amount?: number;
    shareId?: string;
  },
) {
  const method = await db.paymentMethod.findUnique({ where: { provider: input.provider } });
  if (!method || !method.enabled || !method.receiverNumber) {
    throw new AppError("PAYMENTS_UNAVAILABLE", "এই পেমেন্ট মাধ্যমটি এখন চালু নেই।");
  }
  const txn = normalizeTxnId(input.transactionId);
  if (!/^[A-Z0-9]{6,24}$/.test(txn)) throw new AppError("BAD_TXN", "সঠিক ট্রানজ্যাকশন আইডি লিখুন (ইংরেজি অক্ষর ও সংখ্যা)।");
  const sender = normalizeMsisdn(input.senderNumber);
  if (!sender) throw new AppError("BAD_SENDER", "যে নম্বর থেকে টাকা পাঠিয়েছেন সেটি সঠিকভাবে লিখুন (০১XXXXXXXXX)।");

  let amount: number;
  let shareId: string | null = null;
  if (input.purpose === "WALLET_TOPUP") {
    const settings = await getSettings(db);
    if (!input.amount || !settings.topupAmounts.includes(input.amount)) {
      throw new AppError("BAD_AMOUNT", "সঠিক টপ-আপ পরিমাণ বেছে নিন।");
    }
    amount = input.amount;
  } else if (input.purpose === "GROUP_SHARE") {
    if (!input.shareId) throw new AppError("BAD_SHARE", "গ্রুপের পেমেন্ট খুঁজে পাওয়া যায়নি।");
    const share = await db.cycleShare.findUnique({
      where: { id: input.shareId },
      include: { cycle: { include: { group: true } }, membership: true },
    });
    if (!share || share.userId !== input.userId) throw new AppError("BAD_SHARE", "গ্রুপের পেমেন্ট খুঁজে পাওয়া যায়নি।", 404);
    if (share.status !== "UNPAID") throw new AppError("NOT_DUE", "এই অংশের টাকা দেওয়ার দরকার নেই।");
    if (share.cycle.status !== "PENDING" || share.cycle.group.status === "CANCELLED" || share.membership.status !== "ACTIVE") {
      throw new AppError("NOT_DUE", "এই গ্রুপে এখন পেমেন্ট নেওয়া হচ্ছে না।");
    }
    const pending = await db.paymentClaim.count({ where: { shareId: share.id, status: "PENDING" } });
    if (pending > 0) throw new AppError("ALREADY_PENDING", "এই অংশের একটি পেমেন্ট ইতিমধ্যে যাচাই হচ্ছে।");
    amount = share.amountDue;
    shareId = share.id;
  } else {
    throw new AppError("BAD_PURPOSE", "পেমেন্টের উদ্দেশ্য সঠিক নয়।");
  }

  try {
    const claim = await db.paymentClaim.create({
      data: {
        userId: input.userId,
        provider: method.provider,
        transactionId: txn,
        senderNumber: sender,
        amount,
        purpose: input.purpose,
        shareId,
      },
    });
    await audit(db, input.userId, "payment.submit", "PaymentClaim", claim.id, { provider: method.provider, txn, amount, purpose: input.purpose });
    return claim;
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new AppError("DUPLICATE_TXN", "এই ট্রানজ্যাকশন আইডি আগেই জমা দেওয়া হয়েছে। প্রতিটি পেমেন্টের আইডি একবারই ব্যবহার করা যায়।", 409);
    }
    throw e;
  }
}

/**
 * Approve a payment claim after checking the real merchant statement.
 * Exactly-once: the PENDING→APPROVED transition is conditional, and all credits
 * happen in the same transaction with idempotent ledger keys.
 */
export async function approveClaim(db: Db, input: { adminId: string; claimId: string; note: string; now: Date }) {
  const pre = await db.paymentClaim.findUnique({ where: { id: input.claimId }, select: { userId: true } });
  if (!pre) throw new AppError("NOT_FOUND", "Payment not found.", 404);
  await db.wallet.upsert({ where: { userId: pre.userId }, update: {}, create: { userId: pre.userId } });
  return db.$transaction(async (tx) => {
    const upd = await tx.paymentClaim.updateMany({
      where: { id: input.claimId, status: "PENDING" },
      data: { status: "APPROVED", adminNote: input.note || null, reviewedById: input.adminId, reviewedAt: input.now },
    });
    if (upd.count === 0) throw new AppError("ALREADY_REVIEWED", "This payment was already reviewed.", 409);
    const claim = await tx.paymentClaim.findUniqueOrThrow({ where: { id: input.claimId } });
    await ledger(tx, { key: `payment-in:${claim.id}`, kind: "PAYMENT_IN", amount: claim.amount, userId: claim.userId, refType: "PaymentClaim", refId: claim.id, memo: `${claim.provider} ${claim.transactionId}` });

    let outcome: "WALLET_CREDITED" | "SHARE_PAID" | "REFUND_CREATED" = "WALLET_CREDITED";
    let activated = false;
    if (claim.purpose === "WALLET_TOPUP") {
      const wallet = await tx.wallet.update({
        where: { userId: claim.userId },
        data: { balance: { increment: claim.amount } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "TOPUP",
          amount: claim.amount,
          balanceAfter: wallet.balance,
          refType: "PaymentClaim",
          refId: claim.id,
          note: `${claim.provider} ${claim.transactionId}`,
        },
      });
      await ledger(tx, { key: `wallet-credit:${claim.id}`, kind: "WALLET_CREDIT", amount: claim.amount, userId: claim.userId, refType: "PaymentClaim", refId: claim.id });
    } else {
      const share = claim.shareId ? await tx.cycleShare.findUnique({ where: { id: claim.shareId } }) : null;
      if (share) await tx.$queryRaw`SELECT id FROM "GroupCycle" WHERE id = ${share.cycleId} FOR UPDATE`;
      const paid = share
        ? await tx.cycleShare.updateMany({ where: { id: share.id, status: "UNPAID" }, data: { status: "PAID", paidAt: input.now } })
        : { count: 0 };
      if (paid.count === 1 && share) {
        outcome = "SHARE_PAID";
        await ledger(tx, { key: `share-paid:${share.id}`, kind: "GROUP_SHARE_PAID", amount: claim.amount, userId: claim.userId, refType: "CycleShare", refId: share.id });
        activated = await maybeActivate(tx, share.cycleId, input.now);
      } else {
        // Share was voided (member left / group cancelled) or already paid: money is owed back.
        outcome = "REFUND_CREATED";
        const r = await tx.refund.create({
          data: {
            userId: claim.userId,
            shareId: claim.shareId,
            paymentId: claim.id,
            amount: claim.amount,
            reason: "পেমেন্ট অনুমোদনের আগে গ্রুপের অংশটি আর প্রযোজ্য ছিল না",
          },
        });
        await ledger(tx, { key: `refund-due:${r.id}`, kind: "REFUND_DUE", amount: r.amount, userId: claim.userId, refType: "Refund", refId: r.id });
      }
    }
    await audit(tx, input.adminId, "payment.approve", "PaymentClaim", claim.id, { note: input.note, outcome, activated });
    return { claim, outcome, activated };
  });
}

export async function rejectClaim(db: Db, input: { adminId: string; claimId: string; note: string; now: Date }) {
  const note = input.note.trim();
  if (!note) throw new AppError("NOTE_REQUIRED", "A rejection note is required (the customer will see it).");
  return db.$transaction(async (tx) => {
    const upd = await tx.paymentClaim.updateMany({
      where: { id: input.claimId, status: "PENDING" },
      data: { status: "REJECTED", adminNote: note, reviewedById: input.adminId, reviewedAt: input.now },
    });
    if (upd.count === 0) throw new AppError("ALREADY_REVIEWED", "This payment was already reviewed.", 409);
    await audit(tx, input.adminId, "payment.reject", "PaymentClaim", input.claimId, { note });
  });
}

export async function completeRefund(
  db: Db,
  input: { adminId: string; refundId: string; provider: string; payoutRef: string; note: string; now: Date },
) {
  const ref = input.payoutRef.trim();
  if (!ref) throw new AppError("REF_REQUIRED", "Enter the payout transaction ID you sent the refund with.");
  return db.$transaction(async (tx) => {
    const upd = await tx.refund.updateMany({
      where: { id: input.refundId, status: "PENDING" },
      data: {
        status: "COMPLETED",
        provider: input.provider,
        payoutRef: ref,
        adminNote: input.note || null,
        processedById: input.adminId,
        processedAt: input.now,
      },
    });
    if (upd.count === 0) throw new AppError("ALREADY_DONE", "This refund was already processed.", 409);
    const r = await tx.refund.findUniqueOrThrow({ where: { id: input.refundId } });
    if (r.shareId) await tx.cycleShare.updateMany({ where: { id: r.shareId, status: "REFUND_DUE" }, data: { status: "REFUNDED" } });
    await ledger(tx, { key: `refund-paid:${r.id}`, kind: "REFUND_PAID", amount: r.amount, userId: r.userId, refType: "Refund", refId: r.id, memo: `${input.provider} ${ref}` });
    await audit(tx, input.adminId, "refund.complete", "Refund", r.id, { provider: input.provider, payoutRef: ref, note: input.note });
    return r;
  });
}
