/** Top-up packs with bonus credit. Money in poisha; ৳1 of balance = 1 credit. */
export type Pack = { amount: number; bonusPercent: number; name: string };

export const DEFAULT_PACKS: Pack[] = [
  { amount: 10000, bonusPercent: 0, name: "Mini" },
  { amount: 25000, bonusPercent: 4, name: "Plus" },
  { amount: 50000, bonusPercent: 10, name: "Pro" },
  { amount: 100000, bonusPercent: 15, name: "Max" },
];

export function normalizePacks(raw: unknown, legacyAmounts: number[]): Pack[] {
  if (Array.isArray(raw) && raw.length) {
    const packs = raw
      .map((p) => p as Partial<Pack>)
      .filter((p) => Number.isInteger(p.amount) && (p.amount as number) >= 1000)
      .map((p) => ({ amount: p.amount as number, bonusPercent: Math.max(0, Math.min(100, Math.round(Number(p.bonusPercent) || 0))), name: String(p.name ?? "").slice(0, 20) || "Pack" }));
    if (packs.length) return packs.sort((a, b) => a.amount - b.amount);
  }
  if (legacyAmounts.length && JSON.stringify(legacyAmounts) !== JSON.stringify([10000, 25000, 50000])) {
    return legacyAmounts.map((amount, i) => ({ amount, bonusPercent: 0, name: `Pack ${i + 1}` }));
  }
  return DEFAULT_PACKS;
}

export type BonusRule = { firstTopupBonusPercent: number; firstTopupBonusCap: number; walletMarkupPercent?: number };

/** Safety net: bonus never exceeds what keeps ≥5% profit (after ~1.5% bKash fee) if every credit is used. */
const MIN_MARGIN = 0.05;
const FEE = 0.015;
export function maxSafeBonus(amount: number, markupPercent: number) {
  const limit = Math.floor(amount * ((1 - FEE - MIN_MARGIN) * (100 + markupPercent) / 100 - 1));
  return Math.max(0, limit);
}

/**
 * Bonus credit for a top-up. Pack bonus and first-top-up bonus do NOT stack: the customer gets
 * whichever is larger, so the margin can never go negative from stacking.
 */
export function topupBonus(amount: number, pack: Pack | undefined, isFirst: boolean, rule: BonusRule) {
  const cap = rule.walletMarkupPercent === undefined ? Infinity : maxSafeBonus(amount, rule.walletMarkupPercent);
  const packBonus = Math.min(cap, pack ? Math.floor((amount * pack.bonusPercent) / 100) : 0);
  const firstBonus = Math.min(cap, isFirst ? Math.min(Math.floor((amount * rule.firstTopupBonusPercent) / 100), rule.firstTopupBonusCap) : 0);
  if (firstBonus > packBonus) return { bonus: firstBonus, kind: "FIRST" as const };
  return { bonus: packBonus, kind: packBonus > 0 ? ("PACK" as const) : ("NONE" as const) };
}

/** Worst-case profit share of a pack if every credit is used: price vs AI cost of (amount + bonus). */
export function packMargin(amount: number, bonus: number, markupPercent: number, feePercent = 1.5) {
  const cost = ((amount + bonus) * 100) / (100 + markupPercent);
  return (amount - cost - (amount * feePercent) / 100) / amount;
}
