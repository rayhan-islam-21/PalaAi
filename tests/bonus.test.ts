import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb, makeUser, makeAdmin, txnId } from "./helpers";
import { submitClaim, approveClaim } from "@/lib/services/payments";
import { DEFAULT_PACKS, packMargin, topupBonus } from "@/lib/packs";

const RULE = { firstTopupBonusPercent: 20, firstTopupBonusCap: 10000 };

describe("bonus math", () => {
  it("takes the larger of pack and first-top-up bonus (never both)", () => {
    const max = DEFAULT_PACKS[3]; // ৳1000, 15%
    expect(topupBonus(100000, max, true, RULE)).toEqual({ bonus: 15000, kind: "PACK" }); // 15% (৳150) > capped first (৳100)
    expect(topupBonus(10000, DEFAULT_PACKS[0], true, RULE)).toEqual({ bonus: 2000, kind: "FIRST" }); // ৳100 → +৳20
    expect(topupBonus(50000, DEFAULT_PACKS[2], true, RULE)).toEqual({ bonus: 10000, kind: "FIRST" }); // 20% capped at ৳100 vs 10% = ৳50
    expect(topupBonus(10000, DEFAULT_PACKS[0], false, RULE)).toEqual({ bonus: 0, kind: "NONE" });
  });
  it("every default pack stays profitable at a 33% markup even if fully used", () => {
    for (const p of DEFAULT_PACKS) {
      const { bonus } = topupBonus(p.amount, p, true, RULE);
      expect(packMargin(p.amount, bonus, 33)).toBeGreaterThan(0.08);
    }
  });
});

describe("bonus crediting", () => {
  beforeEach(async () => {
    await resetDb();
    await db.setting.update({ where: { id: 1 }, data: { firstTopupBonusPercent: 20, firstTopupBonusCap: 10000, packs: DEFAULT_PACKS, walletMarkupPercent: 33 } });
  });

  async function topup(userId: string, amount: number) {
    return submitClaim(db, { userId, purpose: "WALLET_TOPUP", provider: "BKASH", transactionId: txnId(), senderNumber: "01711111111", amount });
  }

  it("first top-up gets +20%, later ones get only the pack bonus, recorded separately", async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    await approveClaim(db, { adminId: admin.id, claimId: (await topup(u.id, 10000)).id, note: "", now: new Date() });
    expect((await db.wallet.findUniqueOrThrow({ where: { userId: u.id } })).balance).toBe(12000);
    await approveClaim(db, { adminId: admin.id, claimId: (await topup(u.id, 50000)).id, note: "", now: new Date() });
    expect((await db.wallet.findUniqueOrThrow({ where: { userId: u.id } })).balance).toBe(12000 + 55000);
    const tx = await db.walletTransaction.findMany({ orderBy: { createdAt: "asc" } });
    expect(tx.map((t) => [t.type, t.amount])).toEqual([["TOPUP", 10000], ["BONUS", 2000], ["TOPUP", 50000], ["BONUS", 5000]]);
    const bonus = await db.ledgerEntry.aggregate({ where: { kind: "BONUS_CREDIT" }, _sum: { amount: true } });
    expect(bonus._sum.amount).toBe(7000);
  });

  it("two first top-ups approved at the same time give the first bonus only once", async () => {
    const admin = await makeAdmin();
    const u = await makeUser();
    const [a, b] = [await topup(u.id, 10000), await topup(u.id, 10000)];
    await Promise.all([a, b].map((c) => approveClaim(db, { adminId: admin.id, claimId: c.id, note: "", now: new Date() })));
    expect((await db.wallet.findUniqueOrThrow({ where: { userId: u.id } })).balance).toBe(20000 + 2000);
    expect(await db.walletTransaction.count({ where: { type: "BONUS" } })).toBe(1);
  });

  it("only configured pack amounts can be bought", async () => {
    const u = await makeUser();
    await expect(topup(u.id, 100000)).resolves.toBeTruthy();
    await expect(topup(u.id, 30000)).rejects.toThrow();
  });
});

describe("bonus safety cap", () => {
  it("reduces bonuses automatically when the markup is too low, so a pack can never lose money", () => {
    const rule = { firstTopupBonusPercent: 20, firstTopupBonusCap: 10000, walletMarkupPercent: 20 };
    for (const p of DEFAULT_PACKS) {
      const { bonus } = topupBonus(p.amount, p, true, rule);
      expect(packMargin(p.amount, bonus, 20)).toBeGreaterThanOrEqual(0.0499);
    }
    // At 33% markup the full bonuses fit.
    expect(topupBonus(10000, DEFAULT_PACKS[0], true, { ...rule, walletMarkupPercent: 33 }).bonus).toBe(2000);
  });
});
