import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { currentTime } from "@/lib/clock";
import { activeAllowances } from "@/lib/services/groups";
import { AppShell } from "@/components/AppShell";
import { Countdown } from "@/components/Countdown";
import { StatusBadge } from "@/components/Badges";
import { taka, bnNum } from "@/lib/money";
import { IconChat } from "@/components/Icons";
import { formatSlot, formatDhaka } from "@/lib/slots";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser("/dashboard");
  const now = await currentTime(prisma);
  const [allowances, wallet, memberships, pendingClaims, dueShares, recent] = await Promise.all([
    activeAllowances(prisma, user.id, now),
    prisma.wallet.findUnique({ where: { userId: user.id } }),
    prisma.membership.findMany({ where: { userId: user.id, status: "ACTIVE" }, include: { group: true }, orderBy: { joinedAt: "desc" } }),
    prisma.paymentClaim.count({ where: { userId: user.id, status: "PENDING" } }),
    prisma.cycleShare.findMany({
      where: { userId: user.id, status: "UNPAID", cycle: { status: "PENDING", group: { status: { not: "CANCELLED" } } }, membership: { status: "ACTIVE" } },
      include: { cycle: { include: { group: true } } },
    }),
    prisma.conversation.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 3, select: { id: true, title: true, updatedAt: true } }),
  ]);
  const sorted = [...allowances].sort((a, b) => (a.window?.start.getTime() ?? Infinity) - (b.window?.start.getTime() ?? Infinity));
  const activeNow = allowances.find((a) => a.window?.active);
  const next = activeNow ?? sorted.find((a) => a.window);

  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "numeric", hourCycle: "h23" }).format(now));
  const greet = hour < 12 ? "শুভ সকাল" : hour < 17 ? "শুভ দুপুর" : hour < 20 ? "শুভ সন্ধ্যা" : "শুভ রাত্রি";
  const pct = next ? Math.max(0, Math.min(100, Math.round((next.remaining / Math.max(1, next.allowance)) * 100))) : 0;

  return (
    <AppShell>
      <div className="space-y-0.5">
        <div className="text-sm text-mute">{greet}</div>
        <h1 className="h1">{user.name}</h1>
      </div>

      {next ? (
        <div className={`mt-4 space-y-3 rounded-[20px] p-5 ${activeNow ? "bg-brand-600 text-white" : "border border-line bg-white"}`} data-testid="slot-card">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[13.5px] ${activeNow ? "text-brand-100" : "text-mute"}`}>{next.groupName}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${activeNow ? "bg-white/15" : "bg-mint text-brand-900"}`}>চালু</span>
          </div>
          {activeNow ? (
            <div className="space-y-0.5">
              <div className="text-[22px] font-bold">এখন আপনার সময় চলছে</div>
              <div className="text-[14.5px] text-brand-50">{formatSlot(next.slot)} · শেষ হতে বাকি</div>
              <div className="num pt-1 text-[34px] font-extrabold tracking-tight"><Countdown target={activeNow.window!.end.toISOString()} serverNow={now.toISOString()} /></div>
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="text-[19px] font-bold">পরের সময়: {formatSlot(next.slot)}</div>
              <div className="text-[14.5px] text-mute">শুরু হতে বাকি</div>
              <div className="num pt-1 text-[34px] font-extrabold tracking-tight text-brand-600"><Countdown target={next.window!.start.toISOString()} serverNow={now.toISOString()} /></div>
            </div>
          )}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[13.5px]"><span>অ্যালাওয়েন্স বাকি</span><span className="num font-bold">{taka(next.remaining)} / {taka(next.allowance)}</span></div>
            <div className={`h-2 overflow-hidden rounded-full ${activeNow ? "bg-white/25" : "bg-[#eef2ef]"}`}>
              <div className={`h-full ${activeNow ? "bg-white" : "bg-brand-600"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
          <Link href="/chat" className={`flex min-h-[50px] items-center justify-center gap-2 rounded-[14px] text-[17px] font-bold ${activeNow ? "bg-white text-brand-900" : "bg-brand-600 text-white"}`}>
            <IconChat size={20} /> চ্যাট শুরু করুন
          </Link>
        </div>
      ) : (
        <div className="mt-4 space-y-3 rounded-[20px] bg-brand-600 p-5 text-white">
          <div className="text-[20px] font-bold">AI-এর সাথে কথা বলুন</div>
          <p className="text-[14.5px] text-brand-50">বন্ধুদের নিয়ে গ্রুপ খুলুন, অথবা নিজের ওয়ালেট টপ-আপ করে যখন খুশি চ্যাট করুন।</p>
          <Link href="/chat" className="flex min-h-[50px] items-center justify-center gap-2 rounded-[14px] bg-white text-[17px] font-bold text-brand-900">
            <IconChat size={20} /> চ্যাট শুরু করুন
          </Link>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="space-y-1 rounded-2xl border border-line bg-white p-4">
          <div className="text-[13px] text-mute">ওয়ালেট</div>
          <div className="num text-[22px] font-bold" data-testid="wallet-balance">{taka(wallet?.balance ?? 0)}</div>
          <Link href="/wallet" className="inline-block py-1 text-sm font-semibold text-brand-600">টপ-আপ →</Link>
        </div>
        <div className="space-y-1 rounded-2xl border border-line bg-white p-4">
          <div className="text-[13px] text-mute">গ্রুপ অ্যালাওয়েন্স</div>
          <div className="num text-[22px] font-bold">{taka(allowances.reduce((a, b) => a + b.remaining, 0))}</div>
          {next ? <div className="text-[13px] text-mute">মেয়াদ: {formatDhaka(next.cycleEndsAt, false)}</div> : <Link href="/groups/new" className="inline-block py-1 text-sm font-semibold text-brand-600">গ্রুপ খুলুন →</Link>}
        </div>
      </div>

      {(dueShares.length > 0 || pendingClaims > 0) && (
        <div className="mt-3 space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-base font-bold">আপনার করণীয়</h2>
          <ul className="space-y-2">
            {dueShares.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-[15px]">
                <span>{s.cycle.group.name}: আপনার অংশ <span className="num font-semibold">{taka(s.amountDue)}</span> বাকি</span>
                <Link className="btn-primary min-h-10 shrink-0 py-1.5 text-sm" href={`/pay?purpose=GROUP_SHARE&shareId=${s.id}`}>পেমেন্ট করুন</Link>
              </li>
            ))}
            {pendingClaims > 0 && (
              <li><Link href="/payments" className="text-[15px] font-semibold text-brand-700 underline">{bnNum(pendingClaims)}টি পেমেন্ট যাচাই চলছে →</Link></li>
            )}
          </ul>
        </div>
      )}

      <div className="mt-3 space-y-2 rounded-2xl border border-line bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">আমার গ্রুপ</h2>
          <Link href="/groups/new" className="text-sm font-semibold text-brand-600">+ নতুন গ্রুপ</Link>
        </div>
        {memberships.length === 0 ? (
          <p className="text-sm text-mute">
            এখনো কোনো গ্রুপে নেই। <Link className="font-semibold text-brand-600" href="/groups/new">গ্রুপ তৈরি করুন</Link> অথবা{" "}
            <Link className="font-semibold text-brand-600" href="/join">কোড দিয়ে যোগ দিন</Link>।
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {memberships.map((m) => (
              <li key={m.id}>
                <Link href={`/groups/${m.groupId}`} className="flex items-center justify-between gap-2 py-2.5">
                  <span className="font-semibold">{m.group.name}</span>
                  <StatusBadge status={m.group.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {recent.length > 0 && (
        <div className="mt-3 space-y-1 rounded-2xl border border-line bg-white p-4">
          <h2 className="text-base font-bold">সাম্প্রতিক চ্যাট</h2>
          <ul>
            {recent.map((c) => (
              <li key={c.id}>
                <Link href={`/chat/${c.id}`} className="flex justify-between gap-3 py-2 text-[15px]">
                  <span className="truncate">{c.title}</span>
                  <span className="shrink-0 text-[13px] text-mute">{formatDhaka(c.updatedAt, false)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-5 text-center text-xs text-mute">এখনকার সময় (ঢাকা): {formatDhaka(now)}</p>
    </AppShell>
  );
}
