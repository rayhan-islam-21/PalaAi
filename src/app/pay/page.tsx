import { GROUPS_ENABLED } from "@/lib/features";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { enabledMethods, PROVIDER_LABEL } from "@/lib/services/payments";
import { AppShell } from "@/components/AppShell";
import { PayForm } from "@/components/PayForm";
import { submitPaymentAction } from "@/app/actions";
import { taka } from "@/lib/money";
import { topupBonus } from "@/lib/packs";

export const dynamic = "force-dynamic";

export default async function Pay({ searchParams }: { searchParams: Promise<{ purpose?: string; amount?: string; shareId?: string }> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(sp as Record<string, string>).toString();
  const user = await requireUser(`/pay?${qs}`);
  const methods = await enabledMethods(prisma);

  let amount = 0;
  let title = "";
  let receive = "";
  const hidden: Record<string, string> = { purpose: sp.purpose ?? "" };
  if (sp.purpose === "WALLET_TOPUP") {
    const s = await getSettings(prisma);
    amount = parseInt(sp.amount ?? "", 10);
    if (!s.topupAmounts.includes(amount)) {
      return <AppShell><div className="card">সঠিক পরিমাণ বেছে নিন। <Link className="text-brand-700 underline" href="/wallet">ওয়ালেটে ফিরুন</Link></div></AppShell>;
    }
    const pack = s.packs.find((p) => p.amount === amount);
    const first = (await prisma.paymentClaim.count({ where: { userId: user.id, purpose: "WALLET_TOPUP", status: "APPROVED" } })) === 0;
    const { bonus, kind } = topupBonus(amount, pack, first, s);
    title = `ওয়ালেট টপ-আপ ${taka(amount)}`;
    receive = bonus > 0 ? `অনুমোদনের পর ব্যালান্স পাবেন ${taka(amount + bonus)} (${kind === "FIRST" ? "প্রথম টপ-আপ" : "প্যাক"} বোনাস +${taka(bonus)})` : `অনুমোদনের পর ব্যালান্স পাবেন ${taka(amount)}`;
    hidden.amount = String(amount);
  } else if (sp.purpose === "GROUP_SHARE" && sp.shareId && GROUPS_ENABLED) {
    const share = await prisma.cycleShare.findFirst({ where: { id: sp.shareId, userId: user.id }, include: { cycle: { include: { group: true } }, payments: { where: { status: "PENDING" } } } });
    if (!share) return <AppShell><div className="card">পেমেন্ট খুঁজে পাওয়া যায়নি।</div></AppShell>;
    if (share.status !== "UNPAID" || share.payments.length > 0 || share.cycle.status !== "PENDING") {
      return <AppShell><div className="card">এই অংশের জন্য এখন পেমেন্টের দরকার নেই। <Link className="text-brand-700 underline" href={`/groups/${share.cycle.groupId}`}>গ্রুপে ফিরুন</Link></div></AppShell>;
    }
    amount = share.amountDue;
    title = `${share.cycle.group.name} — আপনার অংশ ${taka(amount)}`;
    hidden.shareId = share.id;
  } else {
    return <AppShell><div className="card">পেমেন্টের উদ্দেশ্য বোঝা যায়নি।</div></AppShell>;
  }

  return (
    <AppShell>
      <h1 className="h1">পেমেন্ট</h1>
      <p className="mt-1 text-lg font-semibold text-brand-700">{title}</p>
      {receive && <p className="mt-1 rounded-lg bg-mint px-3 py-2 text-[15px] text-brand-900" data-testid="receive">{receive}</p>}
      {methods.length === 0 ? (
        <div className="card mt-4 border-l-4 border-red-400" data-testid="payments-unavailable">
          <h2 className="h2">পেমেন্ট এখন বন্ধ আছে</h2>
          <p className="mt-1 text-sm text-gray-600">এই মুহূর্তে কোনো বিকাশ/নগদ নম্বর চালু নেই। দয়া করে কোনো টাকা পাঠাবেন না — পরে আবার দেখুন।</p>
        </div>
      ) : (
        <div className="mt-4">
          <PayForm
            action={submitPaymentAction}
            amountLabel={taka(amount)}
            hidden={hidden}
            methods={methods.map((m) => ({ provider: m.provider, label: PROVIDER_LABEL[m.provider] ?? m.provider, receiverNumber: m.receiverNumber, accountType: m.accountType, instructions: m.instructions, isDemo: m.isDemo }))}
          />
          <p className="muted mt-3">জমা দেওয়ার পর পেমেন্টটি “যাচাই চলছে” অবস্থায় থাকবে। আমরা আসল লেনদেন মিলিয়ে দেখে অনুমোদন দিলে তবেই ব্যালান্স/গ্রুপে যোগ হবে।</p>
        </div>
      )}
    </AppShell>
  );
}
