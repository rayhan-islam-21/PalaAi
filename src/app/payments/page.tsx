import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/Badges";
import { PROVIDER_LABEL } from "@/lib/services/payments";
import { taka } from "@/lib/money";
import { formatDhaka } from "@/lib/slots";

export const dynamic = "force-dynamic";

export default async function Payments({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const user = await requireUser("/payments");
  const sp = await searchParams;
  const [claims, refunds] = await Promise.all([
    prisma.paymentClaim.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, include: { share: { include: { cycle: { include: { group: true } } } } } }),
    prisma.refund.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <AppShell>
      <h1 className="h1">আমার পেমেন্ট</h1>
      {sp.submitted && (
        <p className="mt-3 rounded-lg bg-brand-50 p-3 text-sm" role="status">
          পেমেন্ট জমা হয়েছে। যাচাই শেষ হলে এখানে অবস্থা বদলে যাবে।
        </p>
      )}
      {refunds.length > 0 && (
        <div className="card mt-3">
          <h2 className="h2">টাকা ফেরত</h2>
          <ul className="mt-2 divide-y">
            {refunds.map((r) => (
              <li key={r.id} className="py-2 text-sm">
                <div className="flex justify-between"><span>{taka(r.amount)} · {r.reason}</span><StatusBadge status={r.status === "PENDING" ? "REFUND_DUE" : "REFUNDED"} /></div>
                {r.payoutRef && <div className="text-xs text-gray-500">ফেরত TrxID: {r.payoutRef}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="mt-3 space-y-2" data-testid="payment-list">
        {claims.map((c) => (
          <li key={c.id} className="card text-sm">
            <div className="flex items-center justify-between">
              <strong>{taka(c.amount)}</strong>
              <StatusBadge status={c.status} />
            </div>
            <div className="mt-1 text-gray-600">
              {c.purpose === "WALLET_TOPUP" ? "ওয়ালেট টপ-আপ" : `গ্রুপ: ${c.share?.cycle.group.name ?? ""}`} · {PROVIDER_LABEL[c.provider]} · <span className="font-mono">{c.transactionId}</span>
            </div>
            <div className="text-xs text-gray-500">{formatDhaka(c.createdAt)}</div>
            {c.adminNote && c.status !== "PENDING" && <div className="mt-1 rounded bg-gray-50 p-2 text-xs">নোট: {c.adminNote}</div>}
          </li>
        ))}
        {claims.length === 0 && <li className="card text-sm text-gray-600">এখনো কোনো পেমেন্ট নেই।</li>}
      </ul>
    </AppShell>
  );
}
