import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb, makeUser, makeAdmin, txnId, dhaka, FakeProvider, rid } from "./helpers";
import { createGroup, joinGroup, leaveGroup, cancelGroup, renewGroup, activeAllowances, expireCycles } from "@/lib/services/groups";
import { submitClaim, approveClaim, rejectClaim, completeRefund } from "@/lib/services/payments";
import { prepareChat, runChat, type PreparedChat } from "@/lib/services/chat";
import { AppError } from "@/lib/errors";

async function shareFor(groupId: string, userId: string) {
  return db.cycleShare.findFirstOrThrow({ where: { userId, cycle: { groupId, status: { in: ["PENDING", "ACTIVE"] } } } });
}

async function payShare(groupId: string, userId: string, adminId: string, now: Date) {
  const share = await shareFor(groupId, userId);
  const c = await submitClaim(db, { userId, purpose: "GROUP_SHARE", provider: "BKASH", transactionId: txnId(), senderNumber: "01811111111", shareId: share.id });
  return approveClaim(db, { adminId, claimId: c.id, note: "checked statement", now });
}

async function expectAppError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

describe("complete 5-person group journey", () => {
  beforeEach(resetDb);

  it("create → invite → slots → payments → approve → activate → chat in slot → usage deducted", async () => {
    const admin = await makeAdmin();
    const owner = await makeUser("owner");
    const t0 = dhaka("08:00");
    const group = await createGroup(db, { userId: owner.id, name: "Friends", seats: 5, slotIndex: 0, now: t0 });
    const members = [owner];
    for (let i = 1; i < 5; i++) {
      const u = await makeUser("m");
      await joinGroup(db, { userId: u.id, code: group.inviteCode.toLowerCase(), slotIndex: i, now: t0 });
      members.push(u);
    }
    // Price was locked at ৳505 per member for cycle 1.
    const cycle = await db.groupCycle.findFirstOrThrow({ where: { groupId: group.id } });
    expect(cycle.pricePerMember).toBe(50500);
    expect(cycle.sharePerMember).toBe(48000);

    // Activation waits for every payment.
    for (let i = 0; i < 4; i++) {
      const r = await payShare(group.id, members[i].id, admin.id, t0);
      expect(r.activated).toBe(false);
    }
    expect((await db.group.findUniqueOrThrow({ where: { id: group.id } })).status).toBe("FORMING");
    const last = await payShare(group.id, members[4].id, admin.id, t0);
    expect(last.activated).toBe(true);
    const active = await db.groupCycle.findUniqueOrThrow({ where: { id: cycle.id } });
    expect(active.status).toBe("ACTIVE");
    expect(active.endsAt!.getTime() - active.startsAt!.getTime()).toBe(30 * 86400000);

    // Owner's slot is 09:00–11:30 Dhaka.
    const provider = new FakeProvider({ input: 500, output: 300 });
    const p = (await prepareChat(db, provider, {
      userId: owner.id, clientRequestId: rid(), text: "হ্যালো", source: "GROUP", now: dhaka("09:30"),
    })) as PreparedChat;
    expect(p.source).toBe("GROUP");
    const events: string[] = [];
    await runChat(db, provider, p, (e) => events.push(e.type), () => dhaka("09:31"));
    expect(events).toEqual(["meta", "delta", "done"]);
    const share = await shareFor(group.id, owner.id);
    expect(share.reserved).toBe(0);
    expect(share.remaining).toBeLessThan(48000);
    const req = await db.chatRequest.findUniqueOrThrow({ where: { id: p.requestId } });
    expect(req.status).toBe("COMPLETED");
    expect(share.remaining).toBe(48000 - req.charged);
    expect(req.charged).toBeGreaterThan(0);

    // Service fees recorded once per member; collected = 5 × 505.
    const fees = await db.ledgerEntry.aggregate({ where: { kind: "SERVICE_FEE" }, _sum: { amount: true } });
    expect(fees._sum.amount).toBe(5 * 2500);
    const collected = await db.ledgerEntry.aggregate({ where: { kind: "PAYMENT_IN" }, _sum: { amount: true } });
    expect(collected._sum.amount).toBe(5 * 50500);
  });

  it("enforces the slot, wallet opt-in, cycle expiry and renewal", async () => {
    const admin = await makeAdmin();
    const owner = await makeUser("owner");
    const t0 = dhaka("08:00");
    const g = await createGroup(db, { userId: owner.id, name: "G", seats: 4, slotIndex: 1, now: t0 }); // 12:00–15:00
    const others = [];
    for (const i of [0, 2, 3]) {
      const u = await makeUser();
      await joinGroup(db, { userId: u.id, code: g.inviteCode, slotIndex: i, now: t0 });
      others.push(u);
    }
    for (const u of [owner, ...others]) await payShare(g.id, u.id, admin.id, t0);
    const provider = new FakeProvider();

    // Outside own slot → refused, nothing reserved, wallet untouched.
    await expectAppError(prepareChat(db, provider, { userId: owner.id, clientRequestId: rid(), text: "hi", source: "GROUP", now: dhaka("10:00") }), "OUT_OF_SLOT");
    // Explicit wallet selection without balance → insufficient, never silently uses group.
    await expectAppError(prepareChat(db, provider, { userId: owner.id, clientRequestId: rid(), text: "hi", source: "WALLET", now: dhaka("10:00") }), "INSUFFICIENT");
    expect(await db.chatRequest.count()).toBe(0);

    // Inside slot works.
    const ok = await prepareChat(db, provider, { userId: owner.id, clientRequestId: rid(), text: "hi", source: "GROUP", now: dhaka("12:10") });
    expect("requestId" in ok).toBe(true);

    // Shows next slot correctly.
    const allow = await activeAllowances(db, owner.id, dhaka("16:00"));
    expect(allow[0].window!.start.toISOString()).toBe(dhaka("12:00", 2).toISOString());

    // After 30 days the cycle is over.
    const later = new Date(dhaka("12:10").getTime() + 31 * 86400000);
    await expectAppError(prepareChat(db, provider, { userId: owner.id, clientRequestId: rid(), text: "hi", source: "GROUP", now: later }), "NO_GROUP");
    expect((await db.group.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("EXPIRED");

    // Chat history survives; renewal opens a new pending cycle at current pricing.
    expect(await db.conversation.count({ where: { userId: owner.id } })).toBe(1);
    await db.setting.update({ where: { id: 1 }, data: { serviceFeePerMember: 3000 } });
    const c2 = await renewGroup(db, { userId: others[0].id, groupId: g.id, now: later });
    expect(c2.cycleNumber).toBe(2);
    expect(c2.pricePerMember).toBe(60000 + 3000);
    await expectAppError(renewGroup(db, { userId: owner.id, groupId: g.id, now: later }), "NOT_EXPIRED");
  });

  it("two users racing for the last seat/slot: exactly one wins", async () => {
    const owner = await makeUser("owner");
    const g = await createGroup(db, { userId: owner.id, name: "Race", seats: 4, slotIndex: 0, now: new Date() });
    for (const i of [1, 2]) {
      const u = await makeUser();
      await joinGroup(db, { userId: u.id, code: g.inviteCode, slotIndex: i, now: new Date() });
    }
    const a = await makeUser("a");
    const b = await makeUser("b");
    const results = await Promise.allSettled([
      joinGroup(db, { userId: a.id, code: g.inviteCode, slotIndex: 3, now: new Date() }),
      joinGroup(db, { userId: b.id, code: g.inviteCode, slotIndex: 3, now: new Date() }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const bad = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(1);
    expect((bad[0].reason as AppError).code).toBe("SLOT_TAKEN");
    expect(await db.membership.count({ where: { groupId: g.id, status: "ACTIVE" } })).toBe(4);
    // Same user twice is rejected too.
    await expectAppError(joinGroup(db, { userId: owner.id, code: g.inviteCode, slotIndex: 1, now: new Date() }), "ALREADY_MEMBER");
  });

  it("concurrent final approvals still activate the group exactly once", async () => {
    const admin = await makeAdmin();
    const owner = await makeUser("owner");
    const g = await createGroup(db, { userId: owner.id, name: "C", seats: 4, slotIndex: 0, now: new Date() });
    const us = [owner];
    for (const i of [1, 2, 3]) {
      const u = await makeUser();
      await joinGroup(db, { userId: u.id, code: g.inviteCode, slotIndex: i, now: new Date() });
      us.push(u);
    }
    await payShare(g.id, us[0].id, admin.id, new Date());
    await payShare(g.id, us[1].id, admin.id, new Date());
    const claims = [];
    for (const u of us.slice(2)) {
      const s = await shareFor(g.id, u.id);
      claims.push(await submitClaim(db, { userId: u.id, purpose: "GROUP_SHARE", provider: "BKASH", transactionId: txnId(), senderNumber: "01811111111", shareId: s.id }));
    }
    await Promise.all(claims.map((c) => approveClaim(db, { adminId: admin.id, claimId: c.id, note: "", now: new Date() })));
    expect((await db.group.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("ACTIVE");
    expect(await db.ledgerEntry.count({ where: { kind: "SERVICE_FEE" } })).toBe(4);
  });
});

describe("payments are exactly-once", () => {
  beforeEach(resetDb);

  it("rejects duplicate approval and duplicate transaction IDs", async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    const id = txnId();
    const c = await submitClaim(db, { userId: u.id, purpose: "WALLET_TOPUP", provider: "BKASH", transactionId: id, senderNumber: "+8801711111111", amount: 10000 });
    expect(c.status).toBe("PENDING");
    // Same txn id again (even lower-case / spaced, even by another user) is rejected.
    const other = await makeUser();
    await expectAppError(
      submitClaim(db, { userId: other.id, purpose: "WALLET_TOPUP", provider: "BKASH", transactionId: ` ${id.toLowerCase()} `, senderNumber: "01711111111", amount: 10000 }),
      "DUPLICATE_TXN",
    );
    // Concurrent double-approval credits once.
    const results = await Promise.allSettled([
      approveClaim(db, { adminId: admin.id, claimId: c.id, note: "a", now: new Date() }),
      approveClaim(db, { adminId: admin.id, claimId: c.id, note: "b", now: new Date() }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const w = await db.wallet.findUniqueOrThrow({ where: { userId: u.id } });
    expect(w.balance).toBe(10000);
    await expectAppError(approveClaim(db, { adminId: admin.id, claimId: c.id, note: "", now: new Date() }), "ALREADY_REVIEWED");
    await expectAppError(rejectClaim(db, { adminId: admin.id, claimId: c.id, note: "late", now: new Date() }), "ALREADY_REVIEWED");
    expect(await db.walletTransaction.count()).toBe(1);
  });

  it("rejection requires a note and does not credit", async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    const c = await submitClaim(db, { userId: u.id, purpose: "WALLET_TOPUP", provider: "BKASH", transactionId: txnId(), senderNumber: "01711111111", amount: 25000 });
    await expectAppError(rejectClaim(db, { adminId: admin.id, claimId: c.id, note: " ", now: new Date() }), "NOTE_REQUIRED");
    await rejectClaim(db, { adminId: admin.id, claimId: c.id, note: "No such transaction in statement", now: new Date() });
    expect((await db.paymentClaim.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("REJECTED");
    expect(await db.wallet.findUnique({ where: { userId: u.id } })).toBeNull();
  });

  it("refuses unavailable methods, invalid amounts and invalid input", async () => {
    const u = await makeUser();
    await expectAppError(submitClaim(db, { userId: u.id, purpose: "WALLET_TOPUP", provider: "NAGAD", transactionId: txnId(), senderNumber: "01711111111", amount: 10000 }), "PAYMENTS_UNAVAILABLE");
    await expectAppError(submitClaim(db, { userId: u.id, purpose: "WALLET_TOPUP", provider: "BKASH", transactionId: txnId(), senderNumber: "01711111111", amount: 12345 }), "BAD_AMOUNT");
    await expectAppError(submitClaim(db, { userId: u.id, purpose: "WALLET_TOPUP", provider: "BKASH", transactionId: "x", senderNumber: "01711111111", amount: 10000 }), "BAD_TXN");
    await expectAppError(submitClaim(db, { userId: u.id, purpose: "WALLET_TOPUP", provider: "BKASH", transactionId: txnId(), senderNumber: "123", amount: 10000 }), "BAD_SENDER");
  });
});

describe("incomplete groups, leaving and refunds", () => {
  beforeEach(resetDb);

  it("unpaid members can leave, paid cannot; cancel creates auditable refunds", async () => {
    const admin = await makeAdmin();
    const owner = await makeUser("owner");
    const g = await createGroup(db, { userId: owner.id, name: "L", seats: 4, slotIndex: 0, now: new Date() });
    const paid = await makeUser("paid");
    const unpaid = await makeUser("unpaid");
    await joinGroup(db, { userId: paid.id, code: g.inviteCode, slotIndex: 1, now: new Date() });
    await joinGroup(db, { userId: unpaid.id, code: g.inviteCode, slotIndex: 2, now: new Date() });
    await payShare(g.id, owner.id, admin.id, new Date());
    await payShare(g.id, paid.id, admin.id, new Date());

    await expectAppError(leaveGroup(db, { userId: paid.id, groupId: g.id, now: new Date() }), "ALREADY_PAID");
    await expectAppError(leaveGroup(db, { userId: owner.id, groupId: g.id, now: new Date() }), "OWNER");
    await leaveGroup(db, { userId: unpaid.id, groupId: g.id, now: new Date() });
    // Freed slot can be taken by someone else.
    const newbie = await makeUser("new");
    await joinGroup(db, { userId: newbie.id, code: g.inviteCode, slotIndex: 2, now: new Date() });
    // Non-owner cannot cancel.
    await expectAppError(cancelGroup(db, { actorId: paid.id, isAdmin: false, groupId: g.id, reason: "x", now: new Date() }), "FORBIDDEN");

    // Newbie submits a claim, then owner cancels before approval.
    const ns = await shareFor(g.id, newbie.id);
    const late = await submitClaim(db, { userId: newbie.id, purpose: "GROUP_SHARE", provider: "BKASH", transactionId: txnId(), senderNumber: "01711111111", shareId: ns.id });
    const { refunds } = await cancelGroup(db, { actorId: owner.id, isAdmin: false, groupId: g.id, reason: "not enough friends", now: new Date() });
    expect(refunds).toHaveLength(2);
    // Approving the late claim creates a refund instead of a paid share.
    const r = await approveClaim(db, { adminId: admin.id, claimId: late.id, note: "", now: new Date() });
    expect(r.outcome).toBe("REFUND_CREATED");
    const pending = await db.refund.findMany({ where: { status: "PENDING" } });
    expect(pending.map((x) => x.amount).sort()).toEqual([62500, 62500, 62500]);

    // Refund workflow is exactly-once and audited.
    await completeRefund(db, { adminId: admin.id, refundId: pending[0].id, provider: "BKASH", payoutRef: "RFND123", note: "sent", now: new Date() });
    await expectAppError(completeRefund(db, { adminId: admin.id, refundId: pending[0].id, provider: "BKASH", payoutRef: "RFND123", note: "", now: new Date() }), "ALREADY_DONE");
    expect(await db.auditLog.count({ where: { action: "refund.complete" } })).toBe(1);
    const paidOut = await db.ledgerEntry.aggregate({ where: { kind: "REFUND_PAID" }, _sum: { amount: true } });
    expect(paidOut._sum.amount).toBe(62500);
    // Cancelled group never activates.
    expect((await db.group.findUniqueOrThrow({ where: { id: g.id } })).status).toBe("CANCELLED");
  });

  it("expireCycles is idempotent", async () => {
    await expireCycles(db, new Date());
    await expireCycles(db, new Date());
  });
});
