import Link from "next/link";
import { prisma } from "@/lib/db";
import { ActionForm } from "@/components/ActionForm";
import { takaPlain } from "@/lib/money";
import { approvePaymentAction, rejectPaymentAction } from "../actions";

export default async function AdminPayments({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const status = ["PENDING", "APPROVED", "REJECTED"].includes(sp.status ?? "") ? sp.status! : "PENDING";
  const claims = await prisma.paymentClaim.findMany({
    where: { status },
    orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" },
    take: 200,
    include: {
      user: { select: { name: true, email: true } },
      reviewedBy: { select: { name: true } },
      share: { include: { cycle: { include: { group: { select: { id: true, name: true, status: true } } } }, membership: { select: { status: true } } } },
    },
  });
  return (
    <div>
      <h1 className="h1">Payment verification</h1>
      <p className="muted mt-1">A submitted transaction ID is a claim, not proof. Check your bKash/Nagad merchant statement for the exact TrxID, amount and sender before approving.</p>
      <div className="mt-3 flex gap-2">
        {["PENDING", "APPROVED", "REJECTED"].map((s) => (
          <Link key={s} href={`/admin/payments?status=${s}`} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${s === status ? "bg-brand-600 text-white" : "bg-white ring-1 ring-black/10"}`}>{s}</Link>
        ))}
      </div>
      <ul className="mt-4 space-y-3">
        {claims.map((c) => (
          <li key={c.id} className="card" data-testid="claim">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-lg font-bold">{takaPlain(c.amount)} · {c.provider}</div>
                <div className="font-mono text-base">TrxID: <strong>{c.transactionId}</strong></div>
                <div className="text-sm">From: <span className="font-mono">{c.senderNumber}</span></div>
                <div className="text-sm text-gray-600">{c.user.name} ({c.user.email})</div>
                <div className="text-sm text-gray-600">
                  {c.purpose === "WALLET_TOPUP" ? "Wallet top-up" : <>Group share: <Link className="underline" href={`/admin/groups/${c.share?.cycle.group.id}`}>{c.share?.cycle.group.name}</Link> (group {c.share?.cycle.group.status}, share {c.share?.status}, member {c.share?.membership.status})</>}
                </div>
                <div className="text-xs text-gray-500">Submitted {c.createdAt.toISOString().replace("T", " ").slice(0, 16)} UTC</div>
                {c.status !== "PENDING" && <div className="mt-1 text-sm">Reviewed by {c.reviewedBy?.name} — {c.adminNote || "(no note)"}</div>}
              </div>
              {c.status === "PENDING" && (
                <div className="grid w-full gap-2 sm:w-80">
                  <ActionForm action={approvePaymentAction} submitLabel="Approve (verified in statement)" className="space-y-2" confirm={`Approve ${takaPlain(c.amount)} ${c.provider} ${c.transactionId}?`}>
                    <input type="hidden" name="claimId" value={c.id} />
                    <input className="input text-sm" name="note" placeholder="Note (optional)" />
                  </ActionForm>
                  <ActionForm action={rejectPaymentAction} submitLabel="Reject" submitClass="btn-danger w-full" className="space-y-2">
                    <input type="hidden" name="claimId" value={c.id} />
                    <input className="input text-sm" name="note" placeholder="Reason shown to customer (required)" required />
                  </ActionForm>
                </div>
              )}
            </div>
          </li>
        ))}
        {claims.length === 0 && <li className="card text-sm text-gray-500">No {status.toLowerCase()} payments.</li>}
      </ul>
    </div>
  );
}
