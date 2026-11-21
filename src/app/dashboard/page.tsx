import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { currentTime } from "@/lib/clock";
import { getSettings } from "@/lib/settings";
import { AppShell } from "@/components/AppShell";
import { IconChat, IconWallet } from "@/components/Icons";
import { taka, takaPrecise, bnNum } from "@/lib/money";
import { formatDhaka } from "@/lib/slots";
import { approxMessages } from "@/lib/estimates";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser("/dashboard");
  const now = await currentTime(prisma);
  const [settings, wallet, pendingClaims, recent, used] = await Promise.all([
    getSettings(prisma),
    prisma.wallet.findUnique({ where: { userId: user.id } }),
    prisma.paymentClaim.findMany({ where: { userId: user.id, status: "PENDING" }, orderBy: { createdAt: "desc" } }),
    prisma.conversation.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 4, select: { id: true, title: true, updatedAt: true } }),
    prisma.chatRequest.aggregate({ where: { userId: user.id, source: "WALLET" }, _sum: { charged: true }, _count: true }),
  ]);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "numeric", hourCycle: "h23" }).format(now));
  const greet = hour < 12 ? "শুভ সকাল" : hour < 17 ? "শুভ দুপুর" : hour < 20 ? "শুভ সন্ধ্যা" : "শুভ রাত্রি";
  const balance = wallet?.balance ?? 0;
  const low = balance < 2000;

  return (
    <AppShell>
      <div className="space-y-0.5">
        <div className="text-sm text-mute">{greet}</div>
        <h1 className="h1">{user.name}</h1>
      </div>

      <div className="mt-4 space-y-3 rounded-[20px] bg-brand-600 p-5 text-white" data-testid="balance-card">
        <div className="flex items-center justify-between">
          <span className="text-[13.5px] text-brand-100">আমার ওয়ালেট ব্যালান্স</span>
          <IconWallet size={20} />
        </div>
        <div className="num text-[40px] font-extrabold leading-none" data-testid="wallet-balance">{taka(balance)}</div>
        <div className="text-[14.5px] text-brand-50">
          {balance > 0 ? <>প্রায় {bnNum(approxMessages(settings, balance))}টি সাধারণ মেসেজ · মেয়াদ নেই</> : "চ্যাট শুরু করতে ক্রেডিট কিনুন"}
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Link href="/chat" className="flex min-h-[50px] items-center justify-center gap-2 rounded-[14px] bg-white text-[16px] font-bold text-brand-900">
            <IconChat size={20} /> চ্যাট করুন
          </Link>
          <Link href="/wallet" className="flex min-h-[50px] items-center justify-center rounded-[14px] border border-white/40 text-[16px] font-bold text-white hover:bg-white/10">
            টপ-আপ
          </Link>
        </div>
      </div>

      {low && balance > 0 && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[14.5px] text-amber-900">
          ব্যালান্স কমে এসেছে। মাঝপথে থেমে না যেতে আগেই <Link href="/wallet" className="font-semibold underline">টপ-আপ করে নিন</Link>।
        </p>
      )}

      {pendingClaims.length > 0 && (
        <div className="mt-3 space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-base font-bold">যাচাই চলছে</h2>
          <ul className="space-y-1 text-[15px]">
            {pendingClaims.map((c) => (
              <li key={c.id} className="flex justify-between gap-2"><span className="num">{taka(c.amount)} · {c.transactionId}</span><span className="text-sm text-amber-900">অনুমোদনের অপেক্ষায়</span></li>
            ))}
          </ul>
          <Link href="/payments" className="inline-block text-sm font-semibold text-brand-700 underline">সব পেমেন্ট দেখুন →</Link>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="space-y-1 rounded-2xl border border-line bg-white p-4">
          <div className="text-[13px] text-mute">মোট ব্যবহার</div>
          <div className="num text-[22px] font-bold">{takaPrecise(used._sum.charged ?? 0)}</div>
          <div className="text-[13px] text-mute">{bnNum(used._count)}টি উত্তর</div>
        </div>
        <div className="space-y-1 rounded-2xl border border-line bg-white p-4">
          <div className="text-[13px] text-mute">গড় খরচ / উত্তর</div>
          <div className="num text-[22px] font-bold">{used._count ? takaPrecise(Math.round((used._sum.charged ?? 0) / used._count)) : "—"}</div>
          <Link href="/wallet" className="text-[13px] font-semibold text-brand-600">হিসাব দেখুন →</Link>
        </div>
      </div>

      <div className="mt-3 space-y-1 rounded-2xl border border-line bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">সাম্প্রতিক চ্যাট</h2>
          <Link href="/chat" className="text-sm font-semibold text-brand-600">+ নতুন চ্যাট</Link>
        </div>
        {recent.length === 0 ? (
          <p className="py-1 text-sm text-mute">এখনো কোনো চ্যাট নেই।</p>
        ) : (
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
        )}
      </div>
      <p className="mt-4 rounded-xl bg-ground px-4 py-3 text-[13.5px] leading-relaxed text-mute">
        টিপ: নতুন বিষয়ে নতুন চ্যাট শুরু করুন — লম্বা চ্যাটে প্রতিবার আগের সব লেখাও পড়তে হয়, তাই খরচ বাড়ে।
      </p>
    </AppShell>
  );
}
