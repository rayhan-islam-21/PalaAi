import { prisma } from "@/lib/db";

export async function businessMetrics() {
  const [byKind, wallets, activeAllow, heldShares, refundsOwed, bySource, pendingClaims] = await Promise.all([
    prisma.ledgerEntry.groupBy({ by: ["kind"], _sum: { amount: true } }),
    prisma.wallet.aggregate({ _sum: { balance: true, reserved: true } }),
    prisma.cycleShare.aggregate({ where: { status: "PAID", cycle: { status: "ACTIVE" } }, _sum: { remaining: true, reserved: true } }),
    prisma.cycleShare.aggregate({ where: { status: "PAID", cycle: { status: "PENDING" } }, _sum: { amountDue: true } }),
    prisma.refund.aggregate({ where: { status: "PENDING" }, _sum: { amount: true }, _count: true }),
    prisma.chatRequest.groupBy({ by: ["source"], _sum: { charged: true, providerCost: true, absorbed: true }, _count: true }),
    prisma.paymentClaim.aggregate({ where: { status: "PENDING" }, _sum: { amount: true }, _count: true }),
  ]);
  const k = (kind: string) => byKind.find((x) => x.kind === kind)?._sum.amount ?? 0;
  const src = (s: string) => bySource.find((x) => x.source === s);
  const walletUsage = src("WALLET")?._sum.charged ?? 0;
  const walletCost = src("WALLET")?._sum.providerCost ?? 0;
  const groupUsage = src("GROUP")?._sum.charged ?? 0;
  const groupCost = src("GROUP")?._sum.providerCost ?? 0;
  const serviceFees = k("SERVICE_FEE");
  return {
    collected: k("PAYMENT_IN"),
    pendingClaims: { amount: pendingClaims._sum.amount ?? 0, count: pendingClaims._count },
    walletBalances: (wallets._sum.balance ?? 0) + (wallets._sum.reserved ?? 0),
    groupAllowanceUnspent: (activeAllow._sum.remaining ?? 0) + (activeAllow._sum.reserved ?? 0),
    heldForForming: heldShares._sum.amountDue ?? 0,
    serviceFees,
    walletUsage,
    walletCost,
    groupUsage,
    groupCost,
    providerCost: k("PROVIDER_COST"),
    refundsOwed: { amount: refundsOwed._sum.amount ?? 0, count: refundsOwed._count },
    refundsPaid: k("REFUND_PAID"),
    expiredAllowance: k("EXPIRED_ALLOWANCE"),
    estimatedMargin: serviceFees + (walletUsage - walletCost) + (groupUsage - groupCost),
    requests: bySource.reduce((a, b) => a + b._count, 0),
  };
}
