import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb, makeUser, makeAdmin, txnId, FakeProvider, rid } from "./helpers";
import { submitClaim, approveClaim } from "@/lib/services/payments";
import { prepareChat, runChat, settleChat, releaseStale, getConversationForUser, type PreparedChat, type StreamEvent } from "@/lib/services/chat";
import { AppError } from "@/lib/errors";
import { MockProvider } from "@/lib/ai/provider";

async function topUp(userId: string, amount = 10000) {
  const admin = await makeAdmin();
  const c = await submitClaim(db, { userId, purpose: "WALLET_TOPUP", provider: "BKASH", transactionId: txnId(), senderNumber: "01711111111", amount });
  await approveClaim(db, { adminId: admin.id, claimId: c.id, note: "ok", now: new Date() });
}

async function chat(userId: string, provider: FakeProvider | MockProvider, opts: { text?: string; conversationId?: string; clientRequestId?: string } = {}) {
  const p = await prepareChat(db, provider, {
    userId,
    clientRequestId: opts.clientRequestId ?? rid(),
    conversationId: opts.conversationId,
    text: opts.text ?? "নমস্কার",
    source: "WALLET",
    now: new Date(),
  });
  if ("duplicate" in p) return { p, events: [] as StreamEvent[] };
  const events: StreamEvent[] = [];
  await runChat(db, provider, p, (e) => events.push(e), () => new Date());
  return { p, events };
}

const wallet = (userId: string) => db.wallet.findUniqueOrThrow({ where: { userId } });

describe("personal wallet journey", () => {
  beforeEach(resetDb);

  it("top up ৳100 → approve → chat → balance and history", async () => {
    const u = await makeUser();
    const c = await submitClaim(db, { userId: u.id, purpose: "WALLET_TOPUP", provider: "BKASH", transactionId: txnId(), senderNumber: "01711111111", amount: 10000 });
    expect(await db.wallet.findUnique({ where: { userId: u.id } })).toBeNull(); // claim is not money yet
    const admin = await makeAdmin();
    await approveClaim(db, { adminId: admin.id, claimId: c.id, note: "ok", now: new Date() });
    expect((await wallet(u.id)).balance).toBe(10000);

    const { p, events } = await chat(u.id, new FakeProvider({ input: 1000, output: 500 }));
    const done = events.find((e) => e.type === "done") as Extract<StreamEvent, { type: "done" }>;
    // 1000 in × $4 + 500 out × $20 = $0.014 × 122 = ৳1.708 × 1.2 markup = ৳2.0496 → 205 poisha
    expect(done.charged).toBe(205);
    const w = await wallet(u.id);
    expect(w.balance).toBe(10000 - 205);
    expect(w.reserved).toBe(0);
    expect(done.remaining).toBe(w.balance);
    const history = await db.walletTransaction.findMany({ where: { walletId: w.id }, orderBy: { createdAt: "asc" } });
    expect(history.map((h) => [h.type, h.amount])).toEqual([["TOPUP", 10000], ["CHAT_CHARGE", -205]]);
    const conv = await getConversationForUser(db, u.id, (p as PreparedChat).conversationId);
    expect(conv!.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(conv!.messages[1].charge).toBe(205);
    const cost = await db.ledgerEntry.findFirstOrThrow({ where: { kind: "PROVIDER_COST" } });
    expect(cost.amount).toBe(171); // our cost without markup
  });

  it("insufficient funds is refused before calling the AI", async () => {
    const u = await makeUser();
    const provider = new FakeProvider();
    await expect(chat(u.id, provider)).rejects.toSatisfy((e: unknown) => (e as AppError).code === "INSUFFICIENT");
    await db.wallet.create({ data: { userId: u.id, balance: 3 } }); // ৳0.03
    await expect(chat(u.id, provider)).rejects.toSatisfy((e: unknown) => (e as AppError).code === "INSUFFICIENT");
    expect(provider.calls).toBe(0);
  });

  it("caps the response length to what the user can afford", async () => {
    const u = await makeUser();
    await db.wallet.create({ data: { userId: u.id, balance: 150 } }); // ৳1.50
    const provider = new FakeProvider({ input: 100, output: 100000 });
    const { p } = await chat(u.id, provider);
    const req = await db.chatRequest.findUniqueOrThrow({ where: { id: (p as PreparedChat).requestId } });
    expect(req.maxTokens).toBeLessThan(4096);
    expect(req.reserved).toBeLessThanOrEqual(150);
    expect((await wallet(u.id)).balance).toBeGreaterThanOrEqual(0);
  });

  it("concurrent requests never overdraw the wallet", async () => {
    const u = await makeUser();
    await db.wallet.create({ data: { userId: u.id, balance: 2000 } }); // ৳20, enough for ~1 max-size reservation
    const provider = new FakeProvider({ input: 100, output: 4000, delay: 50 });
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => chat(u.id, provider)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBeGreaterThanOrEqual(1);
    expect(ok).toBeLessThan(8);
    const w = await wallet(u.id);
    expect(w.balance).toBeGreaterThanOrEqual(0);
    expect(w.reserved).toBe(0);
    const charged = await db.chatRequest.aggregate({ _sum: { charged: true } });
    expect(w.balance + (charged._sum.charged ?? 0)).toBe(2000); // conservation of money
  });

  it("retrying the same request id never generates or charges twice", async () => {
    const u = await makeUser();
    await topUp(u.id);
    const provider = new FakeProvider({ input: 100, output: 100, delay: 30 });
    const id = rid();
    const [a, b] = await Promise.all([chat(u.id, provider, { clientRequestId: id }), chat(u.id, provider, { clientRequestId: id })]);
    const dupCount = [a, b].filter((x) => "duplicate" in x.p).length;
    expect(dupCount).toBe(1);
    expect(provider.calls).toBe(1);
    const again = await chat(u.id, provider, { clientRequestId: id });
    expect("duplicate" in again.p && again.p.status).toBe("COMPLETED");
    expect(provider.calls).toBe(1);
    expect(await db.chatRequest.count()).toBe(1);
    expect(await db.walletTransaction.count({ where: { type: "CHAT_CHARGE" } })).toBe(1);
  });

  it("API failure before output releases the hold; nothing is charged", async () => {
    const u = await makeUser();
    await topUp(u.id);
    const { events } = await chat(u.id, new FakeProvider({ failBefore: true }));
    expect(events.at(-1)!.type).toBe("error");
    const w = await wallet(u.id);
    expect(w.balance).toBe(10000);
    expect(w.reserved).toBe(0);
    const req = await db.chatRequest.findFirstOrThrow();
    expect(req.status).toBe("RELEASED");
    expect(req.charged).toBe(0);
  });

  it("mid-stream failure charges only what was generated", async () => {
    const u = await makeUser();
    await topUp(u.id);
    const { events } = await chat(u.id, new FakeProvider({ failMid: true, input: 100 }));
    const err = events.at(-1) as Extract<StreamEvent, { type: "error" }>;
    expect(err.type).toBe("error");
    expect(err.charged).toBeGreaterThan(0);
    const req = await db.chatRequest.findFirstOrThrow();
    expect(req.status).toBe("FAILED");
    expect((await wallet(u.id)).balance).toBe(10000 - req.charged);
  });

  it("settlement is idempotent", async () => {
    const u = await makeUser();
    await topUp(u.id);
    const provider = new FakeProvider();
    const p = (await prepareChat(db, provider, { userId: u.id, clientRequestId: rid(), text: "x", source: "WALLET", now: new Date() })) as PreparedChat;
    const args = { requestId: p.requestId, inputTokens: 100, outputTokens: 100, content: "x", ok: true, now: new Date() };
    const [s1, s2] = await Promise.all([settleChat(db, args), settleChat(db, args)]);
    expect([s1.alreadySettled, s2.alreadySettled].filter(Boolean)).toHaveLength(1);
    const w = await wallet(u.id);
    expect(w.reserved).toBe(0);
    expect(w.balance).toBe(10000 - (await db.chatRequest.findFirstOrThrow()).charged);
  });

  it("stale reservations (crashed worker) are released", async () => {
    const u = await makeUser();
    await topUp(u.id);
    const old = new Date(Date.now() - 60 * 60 * 1000);
    await prepareChat(db, new FakeProvider(), { userId: u.id, clientRequestId: rid(), text: "x", source: "WALLET", now: old });
    expect((await wallet(u.id)).reserved).toBeGreaterThan(0);
    expect(await releaseStale(db, new Date())).toBe(1);
    const w = await wallet(u.id);
    expect(w.reserved).toBe(0);
    expect(w.balance).toBe(10000);
  });

  it("the demo mock provider streams and is clearly labelled", async () => {
    const u = await makeUser();
    await topUp(u.id);
    const mock = new MockProvider(0);
    expect(mock.label).toMatch(/মক/);
    const { events } = await chat(u.id, mock, { text: "test" });
    expect(events.filter((e) => e.type === "delta").length).toBeGreaterThan(3);
    const msg = await db.message.findFirstOrThrow({ where: { role: "assistant" } });
    expect(msg.content).toContain("আসল Claude নয়");
  });
});

describe("privacy", () => {
  beforeEach(resetDb);

  it("a user cannot read or post into another user's conversation", async () => {
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    await topUp(alice.id);
    await topUp(bob.id);
    const { p } = await chat(alice.id, new FakeProvider(), { text: "secret" });
    const convId = (p as PreparedChat).conversationId;
    expect(await getConversationForUser(db, bob.id, convId)).toBeNull();
    expect(await getConversationForUser(db, alice.id, convId)).not.toBeNull();
    await expect(chat(bob.id, new FakeProvider(), { conversationId: convId })).rejects.toSatisfy((e: unknown) => (e as AppError).code === "NOT_FOUND");
    expect(await db.message.count({ where: { conversationId: convId } })).toBe(2);
  });
});
