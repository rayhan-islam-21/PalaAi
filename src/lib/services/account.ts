import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import type { Db } from "../db";
import { AppError } from "../errors";
import { audit, ledger } from "../audit";
import { normalizeMsisdn } from "./payments";

async function passwordAccount(db: Db, userId: string) {
  return db.account.findFirst({ where: { userId, providerId: "credential" } });
}

async function checkPassword(db: Db, userId: string, password: string) {
  const acc = await passwordAccount(db, userId);
  if (!acc?.password || !(await verifyPassword({ hash: acc.password, password }))) {
    throw new AppError("BAD_PASSWORD", "পাসওয়ার্ড ভুল হয়েছে।", 403);
  }
  return acc;
}

// ---------- Customer self-service ----------

export async function updateProfile(db: Db, userId: string, input: { name: string; phone: string }) {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 60);
  if (name.length < 2) throw new AppError("BAD_NAME", "নাম কমপক্ষে ২ অক্ষরের হতে হবে।");
  let phone: string | null = null;
  if (input.phone.trim()) {
    phone = normalizeMsisdn(input.phone);
    if (!phone) throw new AppError("BAD_PHONE", "সঠিক মোবাইল নম্বর লিখুন (০১XXXXXXXXX)।");
  }
  await db.user.update({ where: { id: userId }, data: { name, phone } });
}

export async function changePassword(db: Db, userId: string, input: { current: string; next: string; sessionToken?: string }) {
  if (input.next.length < 8) throw new AppError("WEAK", "নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।");
  const acc = await checkPassword(db, userId, input.current);
  await db.account.update({ where: { id: acc.id }, data: { password: await hashPassword(input.next) } });
  // Sign out every other device.
  await db.session.deleteMany({ where: { userId, ...(input.sessionToken ? { token: { not: input.sessionToken } } : {}) } });
  await audit(db, userId, "account.password_change", "User", userId);
}

/**
 * Delete an account: personal data and chats are erased; payment and ledger records are kept
 * (anonymised) because they are financial records. Any remaining wallet balance is forfeited,
 * which the customer confirms explicitly.
 */
export async function deleteAccount(db: Db, userId: string, input: { password: string; confirm: string; now: Date }) {
  if (input.confirm.trim() !== "DELETE") throw new AppError("CONFIRM", "নিশ্চিত করতে বড় হাতের অক্ষরে DELETE লিখুন।");
  await checkPassword(db, userId, input.password);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.role === "ADMIN") throw new AppError("ADMIN", "অ্যাডমিন অ্যাকাউন্ট এখান থেকে মোছা যাবে না।");
  const inFlight = await db.chatRequest.count({ where: { userId, status: "RESERVED" } });
  if (inFlight) throw new AppError("BUSY", "একটি উত্তর তৈরি হচ্ছে, একটু পরে আবার চেষ্টা করুন।");
  const wallet = await db.wallet.findUnique({ where: { userId } });
  await db.$transaction(async (tx) => {
    await tx.paymentClaim.updateMany({ where: { userId, status: "PENDING" }, data: { status: "CANCELLED", adminNote: "Account deleted by customer" } });
    if (wallet && wallet.balance > 0) {
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: 0 } });
      await tx.walletTransaction.create({
        data: { walletId: wallet.id, type: "ADJUSTMENT", amount: -wallet.balance, balanceAfter: 0, refType: "AccountDeletion", refId: userId, note: "Forfeited on account deletion" },
      });
      await ledger(tx, { key: `forfeit:${userId}`, kind: "FORFEITED_BALANCE", amount: wallet.balance, userId, refType: "User", refId: userId });
    }
    await tx.conversation.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: { name: "Deleted user", email: `deleted-${randomUUID()}@deleted.invalid`, phone: null, image: null, disabled: true, deletedAt: input.now },
    });
    await audit(tx, userId, "account.delete", "User", userId, { forfeited: wallet?.balance ?? 0 });
  });
}

export async function cancelOwnClaim(db: Db, userId: string, claimId: string) {
  const upd = await db.paymentClaim.updateMany({
    where: { id: claimId, userId, status: "PENDING" },
    data: { status: "CANCELLED", adminNote: "Cancelled by customer" },
  });
  if (upd.count === 0) throw new AppError("NOT_PENDING", "এই পেমেন্টটি আর বাতিল করা যাবে না।");
  await audit(db, userId, "payment.cancel", "PaymentClaim", claimId);
}

export async function renameConversation(db: Db, userId: string, conversationId: string, title: string) {
  const t = title.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!t) throw new AppError("EMPTY", "একটি নাম লিখুন।");
  const upd = await db.conversation.updateMany({ where: { id: conversationId, userId }, data: { title: t } });
  if (upd.count === 0) throw new AppError("NOT_FOUND", "চ্যাট পাওয়া যায়নি।", 404);
}

export async function deleteConversation(db: Db, userId: string, conversationId: string) {
  const conv = await db.conversation.findFirst({ where: { id: conversationId, userId } });
  if (!conv) throw new AppError("NOT_FOUND", "চ্যাট পাওয়া যায়নি।", 404);
  const busy = await db.chatRequest.count({ where: { conversationId, status: "RESERVED" } });
  if (busy) throw new AppError("BUSY", "উত্তর তৈরি শেষ হলে মুছুন।");
  // Billing records (ChatRequest, ledger) stay; only the private text is removed.
  await db.conversation.delete({ where: { id: conv.id } });
}

// ---------- Admin ----------

/** Credit (+) or debit (−) a wallet by hand, e.g. goodwill credit or correcting a mistake. Audited. */
export async function adminAdjustWallet(db: Db, input: { adminId: string; userId: string; amount: number; reason: string }) {
  const reason = input.reason.trim();
  if (!reason) throw new AppError("REASON", "Write a reason (the customer sees it in their history).");
  if (!Number.isInteger(input.amount) || input.amount === 0 || Math.abs(input.amount) > 10_000_000) {
    throw new AppError("AMOUNT", "Enter a non-zero amount.");
  }
  await db.wallet.upsert({ where: { userId: input.userId }, update: {}, create: { userId: input.userId } });
  return db.$transaction(async (tx) => {
    const where = input.amount < 0 ? { userId: input.userId, balance: { gte: -input.amount } } : { userId: input.userId };
    const upd = await tx.wallet.updateMany({ where, data: { balance: { increment: input.amount } } });
    if (upd.count === 0) throw new AppError("INSUFFICIENT", "The wallet doesn't have that much to remove.");
    const w = await tx.wallet.findUniqueOrThrow({ where: { userId: input.userId } });
    const t = await tx.walletTransaction.create({
      data: { walletId: w.id, type: "ADJUSTMENT", amount: input.amount, balanceAfter: w.balance, refType: "Admin", refId: randomUUID(), note: reason },
    });
    await ledger(tx, { key: `adjust:${t.id}`, kind: input.amount > 0 ? "ADMIN_CREDIT" : "ADMIN_DEBIT", amount: Math.abs(input.amount), userId: input.userId, refType: "WalletTransaction", refId: t.id, memo: reason });
    await audit(tx, input.adminId, "wallet.adjust", "User", input.userId, { amount: input.amount, reason });
    return w;
  });
}

export async function adminSetDisabled(db: Db, input: { adminId: string; userId: string; disabled: boolean }) {
  if (input.adminId === input.userId) throw new AppError("SELF", "You can't disable your own account.");
  await db.user.update({ where: { id: input.userId }, data: { disabled: input.disabled } });
  if (input.disabled) await db.session.deleteMany({ where: { userId: input.userId } });
  await audit(db, input.adminId, input.disabled ? "user.disable" : "user.enable", "User", input.userId);
}

/** Set a temporary password for a customer who forgot theirs (no email provider). */
export async function adminResetPassword(db: Db, input: { adminId: string; userId: string; password: string }) {
  if (input.password.length < 8) throw new AppError("WEAK", "Temporary password must be at least 8 characters.");
  const acc = await passwordAccount(db, input.userId);
  const hash = await hashPassword(input.password);
  if (acc) await db.account.update({ where: { id: acc.id }, data: { password: hash } });
  else await db.account.create({ data: { id: randomUUID(), accountId: input.userId, providerId: "credential", userId: input.userId, password: hash } });
  await db.session.deleteMany({ where: { userId: input.userId } });
  await audit(db, input.adminId, "user.password_reset", "User", input.userId);
}
