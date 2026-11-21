import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/Badges";
import { bnNum } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function Groups({ searchParams }: { searchParams: Promise<{ left?: string }> }) {
  const user = await requireUser("/groups");
  const sp = await searchParams;
  const ms = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { group: { include: { memberships: { where: { status: "ACTIVE" } } } } },
    orderBy: { joinedAt: "desc" },
  });
  return (
    <AppShell>
      <h1 className="h1">আমার গ্রুপ</h1>
      {sp.left && <p className="mt-2 rounded-lg bg-brand-50 p-2 text-sm">আপনি গ্রুপ থেকে বের হয়েছেন।</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link href="/groups/new" className="btn-primary">গ্রুপ তৈরি করুন</Link>
        <Link href="/join" className="btn-secondary">কোড দিয়ে যোগ দিন</Link>
      </div>
      <ul className="mt-4 space-y-2">
        {ms.map((m) => (
          <li key={m.id}>
            <Link href={`/groups/${m.groupId}`} className="card flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{m.group.name}</div>
                <div className="muted">
                  {bnNum(m.group.memberships.length)}/{bnNum(m.group.seatCount)} জন · {m.status === "LEFT" ? "আপনি ছেড়ে দিয়েছেন" : m.group.ownerId === user.id ? "আপনি তৈরি করেছেন" : "সদস্য"}
                </div>
              </div>
              <StatusBadge status={m.group.status} />
            </Link>
          </li>
        ))}
        {ms.length === 0 && <li className="card text-sm text-gray-600">এখনো কোনো গ্রুপ নেই।</li>}
      </ul>
    </AppShell>
  );
}
