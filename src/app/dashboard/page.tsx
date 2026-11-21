import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { currentTime } from "@/lib/clock";
import { activeAllowances } from "@/lib/services/groups";
import { AppShell } from "@/components/AppShell";
import { Countdown } from "@/components/Countdown";
import { StatusBadge } from "@/components/Badges";
import { taka } from "@/lib/money";
import { formatSlot, formatDhaka } from "@/lib/slots";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser("/dashboard");
  const now = await currentTime(prisma);
  const [allowances, wallet, memberships, pendingClaims, dueShares] = await Promise.all([
    activeAllowances(prisma, user.id, now),
    prisma.wallet.findUnique({ where: { userId: user.id } }),
    prisma.membership.findMany({ where: { userId: user.id, status: "ACTIVE" }, include: { group: true }, orderBy: { joinedAt: "desc" } }),
    prisma.paymentClaim.count({ where: { userId: user.id, status: "PENDING" } }),
    prisma.cycleShare.findMany({
      where: { userId: user.id, status: "UNPAID", cycle: { status: "PENDING", group: { status: { not: "CANCELLED" } } }, membership: { status: "ACTIVE" } },
      include: { cycle: { include: { group: true } } },
    }),
  ]);
  const sorted = [...allowances].sort((a, b) => (a.window?.start.getTime() ?? Infinity) - (b.window?.start.getTime() ?? Infinity));
  const activeNow = allowances.find((a) => a.window?.active);
  const next = activeNow ?? sorted.find((a) => a.window);

  return (
    <AppShell>
      <h1 className="h1">হ্যালো, {user.name} 👋</h1>

      {next ? (
        <div className={`card mt-4 ${activeNow ? "bg-brand-600 text-white ring-0" : ""}`} data-testid="slot-card">
          <div className="text-sm opacity-80">{next.groupName} · আপনার সময় {formatSlot(next.slot)}</div>
          {activeNow ? (
            <>
              <div className="mt-1 text-2xl font-bold">এখন আপনার সময় চলছে ✅</div>
              <div className="mt-1 text-sm">শেষ হতে বাকি: <Countdown target={activeNow.window!.end.toISOString()} serverNow={now.toISOString()} /></div>
            </>
          ) : (
            <>
              <div className="mt-1 text-sm">পরের সময় শুরু হবে</div>
              <div className="text-2xl font-bold"><Countdown target={next.window!.start.toISOString()} serverNow={now.toISOString()} /></div>
            </>
          )}
          <div className="mt-2 text-sm">গ্রুপ অ্যালাওয়েন্স বাকি: <strong>{taka(next.remaining)}</strong> / {taka(next.allowance)}</div>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="card">
          <div className="muted">ওয়ালেট ব্যালান্স</div>
          <div className="text-xl font-bold" data-testid="wallet-balance">{taka(wallet?.balance ?? 0)}</div>
          <Link href="/wallet" className="mt-1 inline-block text-sm font-semibold text-brand-700">টপ-আপ →</Link>
        </div>
        <div className="card">
          <div className="muted">গ্রুপ অ্যালাওয়েন্স</div>
          <div className="text-xl font-bold">{taka(allowances.reduce((a, b) => a + b.remaining, 0))}</div>
          <Link href="/groups" className="mt-1 inline-block text-sm font-semibold text-brand-700">গ্রুপ দেখুন →</Link>
        </div>
      </div>

      <Link href="/chat" className="btn-primary mt-4 w-full py-3.5 text-lg">💬 চ্যাট শুরু করুন</Link>

      {(dueShares.length > 0 || pendingClaims > 0) && (
        <div className="card mt-4 border-l-4 border-amber-400">
          <h2 className="h2">আপনার করণীয়</h2>
          <ul className="mt-2 space-y-2">
            {dueShares.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <span>{s.cycle.group.name}: আপনার অংশ {taka(s.amountDue)} বাকি</span>
                <Link className="btn-primary min-h-9 py-1 text-sm" href={`/pay?purpose=GROUP_SHARE&shareId=${s.id}`}>পেমেন্ট করুন</Link>
              </li>
            ))}
            {pendingClaims > 0 && (
              <li><Link href="/payments" className="text-brand-700 underline">{pendingClaims}টি পেমেন্ট যাচাই চলছে →</Link></li>
            )}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <h2 className="h2">আমার গ্রুপ</h2>
          <Link href="/groups/new" className="text-sm font-semibold text-brand-700">+ নতুন গ্রুপ</Link>
        </div>
        {memberships.length === 0 ? (
          <div className="card mt-2 text-sm text-gray-600">
            এখনো কোনো গ্রুপে নেই। <Link className="font-semibold text-brand-700" href="/groups/new">গ্রুপ তৈরি করুন</Link> অথবা{" "}
            <Link className="font-semibold text-brand-700" href="/join">কোড দিয়ে যোগ দিন</Link>।
          </div>
        ) : (
          <ul className="mt-2 space-y-2">
            {memberships.map((m) => (
              <li key={m.id}>
                <Link href={`/groups/${m.groupId}`} className="card flex items-center justify-between">
                  <span className="font-semibold">{m.group.name}</span>
                  <StatusBadge status={m.group.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="muted mt-6 text-center">এখনকার সময় (ঢাকা): {formatDhaka(now)}</p>
    </AppShell>
  );
}
