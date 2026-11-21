import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/Badges";
import { PackCards } from "@/components/PackCards";
import { taka, takaPrecise } from "@/lib/money";
import { formatDhaka } from "@/lib/slots";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = { TOPUP: "টপ-আপ", BONUS: "বোনাস", CHAT_CHARGE: "চ্যাট খরচ", ADJUSTMENT: "সমন্বয়" };

export default async function WalletPage() {
  const user = await requireUser("/wallet");
  const [settings, wallet, pending, approvedTopups] = await Promise.all([
    getSettings(prisma),
    prisma.wallet.findUnique({ where: { userId: user.id }, include: { transactions: { orderBy: { createdAt: "desc" }, take: 50 } } }),
    prisma.paymentClaim.findMany({ where: { userId: user.id, purpose: "WALLET_TOPUP", status: "PENDING" }, orderBy: { createdAt: "desc" } }),
    prisma.paymentClaim.count({ where: { userId: user.id, purpose: "WALLET_TOPUP", status: "APPROVED" } }),
  ]);
  const firstTopup = approvedTopups === 0;
  return (
    <AppShell>
      <h1 className="h1">আমার ওয়ালেট</h1>
      <div className="card mt-3 bg-brand-600 text-white ring-0">
        <div className="text-sm opacity-80">বর্তমান ব্যালান্স</div>
        <div className="text-3xl font-extrabold" data-testid="wallet-balance">{taka(wallet?.balance ?? 0)}</div>
        {(wallet?.reserved ?? 0) > 0 && <div className="text-sm opacity-80">চলমান চ্যাটের জন্য আটকে আছে: {takaPrecise(wallet!.reserved)}</div>}
      </div>

      <h2 className="h2 mt-5 mb-3">টপ-আপ করুন</h2>
      <PackCards settings={settings} firstTopup={firstTopup} loggedIn />

      {pending.length > 0 && (
        <div className="card mt-4">
          <h2 className="h2">যাচাই চলছে</h2>
          <ul className="mt-2 divide-y">
            {pending.map((p) => (
              <li key={p.id} className="flex justify-between py-2 text-sm">
                <span>{taka(p.amount)} · {p.transactionId}</span>
                <StatusBadge status="PENDING" />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card mt-4">
        <div className="flex items-center justify-between">
          <h2 className="h2">লেনদেনের ইতিহাস</h2>
          <Link href="/payments" className="text-sm text-brand-700">সব পেমেন্ট →</Link>
        </div>
        {!wallet?.transactions.length ? (
          <p className="muted mt-2">এখনো কোনো লেনদেন নেই।</p>
        ) : (
          <ul className="mt-2 divide-y" data-testid="wallet-history">
            {wallet.transactions.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-medium">{TYPE_LABEL[t.type] ?? t.type}</div>
                  {t.type === "ADJUSTMENT" && t.note && <div className="text-xs text-mute">{t.note}</div>}
                  <div className="text-xs text-gray-500">{formatDhaka(t.createdAt)}</div>
                </div>
                <div className="text-right">
                  <div className={t.amount < 0 ? "text-red-700" : "text-brand-700"}>{t.amount < 0 ? "−" : "+"}{takaPrecise(Math.abs(t.amount))}</div>
                  <div className="text-xs text-gray-500">ব্যালান্স {takaPrecise(t.balanceAfter)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
