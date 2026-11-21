import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db, resetDb, makeUser, makeAdmin, FakeProvider, rid, txnId } from "./helpers";
import { prepareChat, runChat, MAX_PARALLEL, type PreparedChat } from "@/lib/services/chat";
import { submitClaim } from "@/lib/services/payments";
import {
  adminAdjustWallet, adminResetPassword, adminSetDisabled, cancelOwnClaim, changePassword,
  deleteAccount, deleteConversation, renameConversation, updateProfile,
} from "@/lib/services/account";
import { AppError } from "@/lib/errors";

const code = (p: Promise<unknown>) => p.then(() => "OK", (e) => (e as AppError).code);

async function withPassword(name = "u", pw = "secret123") {
  const u = await makeUser(name);
  await db.account.create({ data: { id: randomUUID(), accountId: u.id, providerId: "credential", userId: u.id, password: await hashPassword(pw) } });
  return u;
}

async function chatOnce(userId: string) {
  const p = (await prepareChat(db, new FakeProvider(), { userId, clientRequestId: rid(), text: "hi", source: "WALLET", now: new Date() })) as PreparedChat;
  await runChat(db, new FakeProvider(), p, () => {}, () => new Date());
  return p;
}

describe("customer account features", () => {
  beforeEach(resetDb);

  it("edits profile with validation", async () => {
    const u = await makeUser();
    await updateProfile(db, u.id, { name: "  Karim   Uddin ", phone: "+8801712345678" });
    const r = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(r.name).toBe("Karim Uddin");
    expect(r.phone).toBe("01712345678");
    expect(await code(updateProfile(db, u.id, { name: "K", phone: "" }))).toBe("BAD_NAME");
    expect(await code(updateProfile(db, u.id, { name: "Karim", phone: "123" }))).toBe("BAD_PHONE");
  });

  it("changes password only with the current one and signs out other sessions", async () => {
    const u = await withPassword();
    await db.session.createMany({ data: [
      { id: randomUUID(), token: "keep", userId: u.id, expiresAt: new Date(Date.now() + 1e9) },
      { id: randomUUID(), token: "other", userId: u.id, expiresAt: new Date(Date.now() + 1e9) },
    ] });
    expect(await code(changePassword(db, u.id, { current: "wrong", next: "newpass123" }))).toBe("BAD_PASSWORD");
    await changePassword(db, u.id, { current: "secret123", next: "newpass123", sessionToken: "keep" });
    expect((await db.session.findMany({ where: { userId: u.id } })).map((s) => s.token)).toEqual(["keep"]);
    expect(await code(changePassword(db, u.id, { current: "secret123", next: "x12345678" }))).toBe("BAD_PASSWORD");
  });

  it("renames and deletes only own conversations; billing records survive", async () => {
    const a = await makeUser("a");
    const b = await makeUser("b");
    await db.wallet.create({ data: { userId: a.id, balance: 10000 } });
    const p = await chatOnce(a.id);
    expect(await code(renameConversation(db, b.id, p.conversationId, "x"))).toBe("NOT_FOUND");
    expect(await code(deleteConversation(db, b.id, p.conversationId))).toBe("NOT_FOUND");
    await renameConversation(db, a.id, p.conversationId, "  My chat ");
    expect((await db.conversation.findUniqueOrThrow({ where: { id: p.conversationId } })).title).toBe("My chat");
    await deleteConversation(db, a.id, p.conversationId);
    expect(await db.message.count({ where: { conversationId: p.conversationId } })).toBe(0);
    expect(await db.chatRequest.count({ where: { id: p.requestId } })).toBe(1);
  });

  it("cancels only its own pending payment claim", async () => {
    const u = await makeUser();
    const other = await makeUser();
    const c = await submitClaim(db, { userId: u.id, purpose: "WALLET_TOPUP", provider: "BKASH", transactionId: txnId(), senderNumber: "01711111111", amount: 10000 });
    expect(await code(cancelOwnClaim(db, other.id, c.id))).toBe("NOT_PENDING");
    await cancelOwnClaim(db, u.id, c.id);
    expect((await db.paymentClaim.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("CANCELLED");
    expect(await code(cancelOwnClaim(db, u.id, c.id))).toBe("NOT_PENDING");
  });

  it("deletes an account: needs password + DELETE, erases chats and personal data, keeps money records", async () => {
    const u = await withPassword("del");
    await db.wallet.create({ data: { userId: u.id, balance: 5000 } });
    await chatOnce(u.id);
    expect(await code(deleteAccount(db, u.id, { password: "secret123", confirm: "delete", now: new Date() }))).toBe("CONFIRM");
    expect(await code(deleteAccount(db, u.id, { password: "nope", confirm: "DELETE", now: new Date() }))).toBe("BAD_PASSWORD");
    await deleteAccount(db, u.id, { password: "secret123", confirm: "DELETE", now: new Date() });
    const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.disabled).toBe(true);
    expect(after.email).toMatch(/@deleted\.invalid$/);
    expect(after.name).toBe("Deleted user");
    expect(await db.conversation.count({ where: { userId: u.id } })).toBe(0);
    expect(await db.account.count({ where: { userId: u.id } })).toBe(0);
    expect((await db.wallet.findUniqueOrThrow({ where: { userId: u.id } })).balance).toBe(0);
    expect(await db.chatRequest.count({ where: { userId: u.id } })).toBe(1);
    expect(await db.ledgerEntry.count({ where: { kind: "FORFEITED_BALANCE" } })).toBe(1);
  });

  it("limits how many replies one customer can generate at once", async () => {
    const u = await makeUser();
    await db.wallet.create({ data: { userId: u.id, balance: 100000 } });
    for (let i = 0; i < MAX_PARALLEL; i++) {
      await prepareChat(db, new FakeProvider(), { userId: u.id, clientRequestId: rid(), text: "hi", source: "WALLET", now: new Date() });
    }
    expect(await code(prepareChat(db, new FakeProvider(), { userId: u.id, clientRequestId: rid(), text: "hi", source: "WALLET", now: new Date() }))).toBe("BUSY");
  });
});

describe("admin customer tools", () => {
  beforeEach(resetDb);

  it("adjusts wallets with a reason and never below zero", async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    expect(await code(adminAdjustWallet(db, { adminId: admin.id, userId: u.id, amount: 5000, reason: " " }))).toBe("REASON");
    await adminAdjustWallet(db, { adminId: admin.id, userId: u.id, amount: 5000, reason: "goodwill" });
    expect(await code(adminAdjustWallet(db, { adminId: admin.id, userId: u.id, amount: -6000, reason: "fix" }))).toBe("INSUFFICIENT");
    await adminAdjustWallet(db, { adminId: admin.id, userId: u.id, amount: -2000, reason: "fix" });
    expect((await db.wallet.findUniqueOrThrow({ where: { userId: u.id } })).balance).toBe(3000);
    expect(await db.walletTransaction.count({ where: { type: "ADJUSTMENT" } })).toBe(2);
    expect(await db.auditLog.count({ where: { action: "wallet.adjust" } })).toBe(2);
  });

  it("blocks and unblocks accounts (sessions revoked) and resets passwords", async () => {
    const admin = await makeAdmin();
    const u = await withPassword();
    await db.session.create({ data: { id: randomUUID(), token: "t1", userId: u.id, expiresAt: new Date(Date.now() + 1e9) } });
    expect(await code(adminSetDisabled(db, { adminId: admin.id, userId: admin.id, disabled: true }))).toBe("SELF");
    await adminSetDisabled(db, { adminId: admin.id, userId: u.id, disabled: true });
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).disabled).toBe(true);
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
    await adminSetDisabled(db, { adminId: admin.id, userId: u.id, disabled: false });
    await adminResetPassword(db, { adminId: admin.id, userId: u.id, password: "temp-pass-1" });
    await changePassword(db, u.id, { current: "temp-pass-1", next: "mine12345" });
  });
});
