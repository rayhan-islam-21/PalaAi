import { GROUPS_ENABLED } from "@/lib/features";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { currentTime } from "@/lib/clock";
import { appUrl } from "@/lib/env";
import { expireCycles } from "@/lib/services/groups";
import { AppShell } from "@/components/AppShell";
import { ActionForm } from "@/components/ActionForm";
import { CopyButton } from "@/components/CopyButton";
import { StatusBadge } from "@/components/Badges";
import { taka, bnNum } from "@/lib/money";
import { formatSlot, formatDhaka, type Slot } from "@/lib/slots";
import { cancelGroupAction, leaveGroupAction, renewGroupAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function GroupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; joined?: string }> }) {
  if (!GROUPS_ENABLED) redirect("/dashboard");
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/groups/${id}`);
  const now = await currentTime(prisma);
  await expireCycles(prisma, now, id);
  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      memberships: { where: { status: "ACTIVE" }, include: { user: { select: { id: true, name: true } } } },
      cycles: { orderBy: { cycleNumber: "desc" }, take: 1, include: { shares: { include: { payments: { where: { status: "PENDING" }, select: { id: true } } } } } },
    },
  });
  // Only current or former members may see the group; nobody sees anyone else's chats here.
  const everMember = group && (await prisma.membership.findFirst({ where: { groupId: id, userId: user.id } }));
  if (!group || !everMember) notFound();
  const isOwner = group.ownerId === user.id;
  const me = group.memberships.find((m) => m.userId === user.id);
  const cycle = group.cycles[0];
  const schedule = group.schedule as Slot[];
  const shareOf = (membershipId: string) => cycle?.shares.find((s) => s.membershipId === membershipId);
  const myShare = me ? shareOf(me.id) : undefined;
  const filled = group.memberships.length;
  const emptySeats = group.seatCount - filled;
  const unpaid = group.memberships.filter((m) => shareOf(m.id)?.status !== "PAID");
  const inviteUrl = `${appUrl()}/join/${group.inviteCode}`;
  const pendingCycle = cycle?.status === "PENDING" && group.status !== "CANCELLED";

  return (
    <AppShell>
      {sp.created && <p className="mb-3 rounded-lg bg-brand-50 p-3 text-sm">গ্রুপ তৈরি হয়েছে! নিচের লিংক বা কোড বন্ধুদের পাঠান, তারপর নিজের অংশের পেমেন্ট করুন।</p>}
      {sp.joined && <p className="mb-3 rounded-lg bg-brand-50 p-3 text-sm">আপনি গ্রুপে যোগ দিয়েছেন! এখন নিজের অংশের পেমেন্ট করুন।</p>}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="h1">{group.name}</h1>
          <p className="muted">তৈরি করেছেন {group.owner.name} · {bnNum(group.seatCount)} জনের গ্রুপ</p>
        </div>
        <StatusBadge status={group.status} />
      </div>

      {cycle && (
        <div className="card mt-3 text-[15px]">
          <div className="flex justify-between"><span>মাস #{bnNum(cycle.cycleNumber)} · প্রতিজন</span><strong>{taka(cycle.pricePerMember)}</strong></div>
          <div className="muted">{taka(cycle.sharePerMember)} ব্যবহার + {taka(cycle.feePerMember)} সার্ভিস ফি (এই মাসের জন্য লক করা)</div>
          {cycle.status === "ACTIVE" && cycle.endsAt && <div className="mt-1 text-sm">মেয়াদ শেষ: {formatDhaka(cycle.endsAt)}</div>}
        </div>
      )}

      {pendingCycle && (
        <div className="card mt-3 border-l-4 border-amber-400" data-testid="pending-box">
          <h2 className="h2">চালু হতে বাকি</h2>
          <ul className="mt-1 list-disc pl-5 text-[15px]">
            {emptySeats > 0 && <li>{bnNum(emptySeats)}টি সিট এখনো খালি</li>}
            {unpaid.length > 0 && <li>{bnNum(unpaid.length)} জনের পেমেন্ট এখনো যাচাই হয়নি: {unpaid.map((m) => m.user.name).join(", ")}</li>}
            {emptySeats === 0 && unpaid.length === 0 && <li>সব ঠিক আছে — চালু হচ্ছে…</li>}
          </ul>
        </div>
      )}

      {myShare && pendingCycle && (
        <div className="card mt-3">
          <div className="flex items-center justify-between">
            <span>আপনার অংশ: <strong>{taka(myShare.amountDue)}</strong></span>
            {myShare.payments.length > 0 ? <StatusBadge status="PENDING" /> : <StatusBadge status={myShare.status} />}
          </div>
          {myShare.status === "UNPAID" && myShare.payments.length === 0 && (
            <Link href={`/pay?purpose=GROUP_SHARE&shareId=${myShare.id}`} className="btn-primary mt-3 w-full">বিকাশ/নগদে পেমেন্ট করুন</Link>
          )}
        </div>
      )}

      {pendingCycle && emptySeats > 0 && (
        <div className="card mt-3">
          <h2 className="h2">বন্ধুদের আমন্ত্রণ জানান</h2>
          <div className="mt-2 flex items-center justify-between rounded-xl bg-gray-50 p-3">
            <span className="text-sm text-gray-600">কোড</span>
            <span className="font-mono text-2xl font-bold tracking-widest" data-testid="invite-code">{group.inviteCode}</span>
            <CopyButton text={group.inviteCode} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input className="input font-mono text-sm" readOnly value={inviteUrl} aria-label="আমন্ত্রণ লিংক" />
            <CopyButton text={inviteUrl} label="লিংক কপি" />
          </div>
          <a className="btn-secondary mt-2 w-full" href={`https://wa.me/?text=${encodeURIComponent(`Pala AI গ্রুপে যোগ দাও: ${inviteUrl}`)}`} target="_blank" rel="noreferrer">WhatsApp-এ পাঠান</a>
        </div>
      )}

      <div className="card mt-3">
        <h2 className="h2">সিট ও সময়</h2>
        <ul className="mt-2 divide-y">
          {schedule.map((slot, i) => {
            const m = group.memberships.find((x) => x.slotIndex === i);
            const sh = m ? shareOf(m.id) : undefined;
            return (
              <li key={i} className="flex items-center justify-between gap-2 py-2.5">
                <div>
                  <div className="font-medium">{formatSlot(slot)}</div>
                  <div className="muted">{m ? `${m.user.name}${m.userId === user.id ? " (আপনি)" : ""}` : "খালি সিট"}</div>
                </div>
                {m ? <StatusBadge status={sh?.payments.length ? "PENDING" : (sh?.status ?? "UNPAID")} /> : <span className="badge bg-gray-100 text-gray-500">খালি</span>}
              </li>
            );
          })}
        </ul>
        <p className="muted mt-2">সদস্যরা শুধু পেমেন্টের অবস্থা দেখতে পান। প্রত্যেকের চ্যাট সম্পূর্ণ ব্যক্তিগত।</p>
      </div>

      {group.status === "ACTIVE" && me && <Link href="/chat" className="btn-primary mt-3 w-full">💬 চ্যাটে যান</Link>}

      {group.status === "EXPIRED" && me && (
        <div className="card mt-3">
          <h2 className="h2">মেয়াদ শেষ হয়েছে</h2>
          <p className="muted">আপনার আগের চ্যাটগুলো থেকে যাবে। আবার চালু করতে রিনিউ করুন (বর্তমান দামে)।</p>
          <div className="mt-2">
            <ActionForm action={renewGroupAction} submitLabel="রিনিউ করুন"><input type="hidden" name="groupId" value={group.id} /></ActionForm>
          </div>
        </div>
      )}

      {me && pendingCycle && !isOwner && myShare?.status === "UNPAID" && (
        <div className="mt-4">
          <ActionForm action={leaveGroupAction} submitLabel="গ্রুপ ছেড়ে দিন" submitClass="btn-ghost w-full text-red-700" confirm="আপনি কি নিশ্চিতভাবে গ্রুপ ছাড়তে চান?">
            <input type="hidden" name="groupId" value={group.id} />
          </ActionForm>
        </div>
      )}
      {isOwner && (group.status === "FORMING" || group.status === "EXPIRED") && (
        <details className="mt-4 rounded-xl bg-white p-3 ring-1 ring-black/5">
          <summary className="cursor-pointer text-sm font-semibold text-red-700">গ্রুপ বাতিল করুন</summary>
          <div className="mt-2">
            <ActionForm action={cancelGroupAction} submitLabel="গ্রুপ বাতিল নিশ্চিত করুন" submitClass="btn-danger w-full" confirm="গ্রুপ বাতিল করলে আর ফেরানো যাবে না। যারা টাকা দিয়েছেন তারা ফেরত পাবেন।">
              <input type="hidden" name="groupId" value={group.id} />
              <input className="input" name="reason" placeholder="কারণ (ঐচ্ছিক)" maxLength={200} />
            </ActionForm>
          </div>
        </details>
      )}
      {group.status === "CANCELLED" && (
        <p className="card mt-3 text-sm">এই গ্রুপটি বাতিল হয়েছে। আপনি টাকা দিয়ে থাকলে ফেরতের অবস্থা <Link className="text-brand-700 underline" href="/payments">পেমেন্ট পেজে</Link> দেখুন।</p>
      )}
    </AppShell>
  );
}
