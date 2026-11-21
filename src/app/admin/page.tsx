import Link from "next/link";
import { prisma } from "@/lib/db";
import { takaPlain } from "@/lib/money";
import { hasAnthropicKey, isDemoMode } from "@/lib/env";
import { enabledMethods } from "@/lib/services/payments";
import { businessMetrics } from "./metrics";

export default async function AdminHome() {
  const [m, methods, groups] = await Promise.all([
    businessMetrics(),
    enabledMethods(prisma),
    prisma.group.groupBy({ by: ["status"], _count: true }),
  ]);
  const Tile = ({ label, value, hint, tone = "" }: { label: string; value: string; hint?: string; tone?: string }) => (
    <div className={`card ${tone}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  );
  return (
    <div className="space-y-5">
      <h1 className="h1">Business overview</h1>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className={`card text-sm ${methods.length ? "" : "bg-red-50"}`}>
          <strong>Payments:</strong> {methods.length ? methods.map((x) => x.provider + (x.isDemo ? " (DEMO)" : "")).join(", ") + " enabled" : "No receiving method configured — customers see “payments unavailable”."}{" "}
          <Link className="text-brand-700 underline" href="/admin/settings">Configure</Link>
        </div>
        <div className={`card text-sm ${isDemoMode() || hasAnthropicKey() ? "" : "bg-red-50"}`}>
          <strong>AI:</strong> {isDemoMode() ? "DEMO MODE — mock provider (not real Claude)" : hasAnthropicKey() ? "Anthropic API key configured" : "No ANTHROPIC_API_KEY — live chat disabled"}
        </div>
        <div className="card text-sm">
          <strong>Groups:</strong> {groups.map((g) => `${g.status} ${g._count}`).join(" · ") || "none"}
        </div>
      </div>

      <section>
        <h2 className="h2 mb-2">Money in & obligations</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Collected payments (approved)" value={takaPlain(m.collected)} hint="All verified bKash/Nagad money received" />
          <Tile label="Pending payment claims" value={takaPlain(m.pendingClaims.amount)} hint={`${m.pendingClaims.count} awaiting verification — not money yet`} />
          <Tile label="Unspent wallet balances" value={takaPlain(m.walletBalances)} hint="Owed to customers as service (liability)" tone="bg-amber-50" />
          <Tile label="Unspent group allowances" value={takaPlain(m.groupAllowanceUnspent)} hint="Active cycles — reserved for members' usage" tone="bg-amber-50" />
          <Tile label="Held for forming groups" value={takaPlain(m.heldForForming)} hint="Paid shares, group not active yet (refundable)" tone="bg-amber-50" />
          <Tile label="Refunds owed" value={takaPlain(m.refundsOwed.amount)} hint={`${m.refundsOwed.count} pending refund(s)`} tone={m.refundsOwed.count ? "bg-red-50" : ""} />
          <Tile label="Refunds paid" value={takaPlain(m.refundsPaid)} />
          <Tile label="Expired unused allowance" value={takaPlain(m.expiredAllowance)} hint="Shown separately; not counted as profit" />
        </div>
      </section>

      <section>
        <h2 className="h2 mb-2">Earnings & costs</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Group service fees earned" value={takaPlain(m.serviceFees)} hint="Recognized when a cycle activates" tone="bg-brand-50" />
          <Tile label="Wallet usage charged" value={takaPlain(m.walletUsage)} hint={`Provider cost ${takaPlain(m.walletCost)}`} />
          <Tile label="Group usage charged" value={takaPlain(m.groupUsage)} hint={`Provider cost ${takaPlain(m.groupCost)}`} />
          <Tile label="Estimated provider cost (total)" value={takaPlain(m.providerCost)} hint={`${m.requests} chat requests · from Anthropic-reported tokens`} tone="bg-red-50" />
          <Tile label="Estimated margin" value={takaPlain(m.estimatedMargin)} hint="Service fees + usage markup − provider cost. The usage pool itself is NOT profit." tone="bg-brand-50" />
        </div>
      </section>
    </div>
  );
}
