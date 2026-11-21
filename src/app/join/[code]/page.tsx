import { GROUPS_ENABLED } from "@/lib/features";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getUser } from "@/lib/session";
import { findGroupByCode, openCycle } from "@/lib/services/groups";
import { AppShell } from "@/components/AppShell";
import { ActionForm } from "@/components/ActionForm";
import { joinGroupAction } from "@/app/actions";
import { taka, bnNum } from "@/lib/money";
import { formatSlot, type Slot } from "@/lib/slots";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  if (!GROUPS_ENABLED) redirect("/dashboard");
  const { code } = await params;
  const user = await getUser();
  const group = await findGroupByCode(prisma, code);
  if (!group) {
    return (
      <AppShell>
        <div className="card">এই কোডে কোনো গ্রুপ পাওয়া যায়নি। <Link href="/join" className="text-brand-700 underline">আবার চেষ্টা করুন</Link></div>
      </AppShell>
    );
  }
  const [owner, cycle, members] = await Promise.all([
    prisma.user.findUnique({ where: { id: group.ownerId }, select: { name: true } }),
    openCycle(prisma, group.id),
    prisma.membership.findMany({ where: { groupId: group.id, status: "ACTIVE" } }),
  ]);
  const schedule = group.schedule as Slot[];
  const taken = new Set(members.map((m) => m.slotIndex));
  const isMember = user && members.some((m) => m.userId === user.id);
  const open = cycle?.status === "PENDING" && group.status !== "CANCELLED";

  return (
    <AppShell>
      <h1 className="h1">{group.name}</h1>
      <p className="muted">{owner?.name} আপনাকে আমন্ত্রণ জানিয়েছেন · {bnNum(members.length)}/{bnNum(group.seatCount)} জন যোগ দিয়েছেন</p>
      {cycle && (
        <div className="card mt-3 text-[15px]">
          <div className="flex justify-between"><span>ব্যবহারের অংশ</span><span>{taka(cycle.sharePerMember)}</span></div>
          <div className="flex justify-between"><span>সার্ভিস ফি</span><span>+ {taka(cycle.feePerMember)}</span></div>
          <div className="mt-1 flex justify-between border-t pt-1 text-lg font-bold"><span>আপনার অংশ (৩০ দিন)</span><span className="text-brand-700">{taka(cycle.pricePerMember)}</span></div>
        </div>
      )}
      {isMember ? (
        <Link href={`/groups/${group.id}`} className="btn-primary mt-4 w-full">আপনি ইতিমধ্যে সদস্য — গ্রুপে যান</Link>
      ) : !open ? (
        <div className="card mt-4">এই গ্রুপে এখন নতুন সদস্য নেওয়া হচ্ছে না।</div>
      ) : !user ? (
        <div className="card mt-4 space-y-2">
          <p>যোগ দিতে আগে অ্যাকাউন্ট খুলুন বা লগইন করুন।</p>
          <Link className="btn-primary w-full" href={`/signup?next=/join/${group.inviteCode}`}>অ্যাকাউন্ট খুলুন</Link>
          <Link className="btn-secondary w-full" href={`/login?next=/join/${group.inviteCode}`}>লগইন</Link>
        </div>
      ) : (
        <div className="card mt-4">
          <ActionForm action={joinGroupAction} submitLabel="যোগ দিন ও পেমেন্টে যান">
            <input type="hidden" name="code" value={group.inviteCode} />
            <div className="label">আপনার দৈনিক সময় বেছে নিন (বাংলাদেশ সময়)</div>
            {schedule.map((s, i) => (
              <label key={i} className={`flex items-center gap-3 rounded-xl border p-3 ${taken.has(i) ? "border-gray-100 bg-gray-50 text-gray-400" : "cursor-pointer border-gray-200 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"}`}>
                <input type="radio" name="slotIndex" value={i} disabled={taken.has(i)} required className="h-5 w-5 accent-brand-600" />
                <span>{formatSlot(s)}</span>
                {taken.has(i) && <span className="ml-auto text-xs">নেওয়া হয়েছে</span>}
              </label>
            ))}
          </ActionForm>
        </div>
      )}
    </AppShell>
  );
}
