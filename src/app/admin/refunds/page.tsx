import { prisma } from "@/lib/db";
import { ActionForm } from "@/components/ActionForm";
import { takaPlain } from "@/lib/money";
import { completeRefundAction } from "../actions";

export default async function AdminRefunds() {
  const refunds = await prisma.refund.findMany({
    orderBy: [{ status: "desc" }, { createdAt: "asc" }],
    take: 200,
    include: { user: { select: { name: true, email: true, phone: true } }, share: { include: { cycle: { include: { group: { select: { name: true } } } } } } },
  });
  const paymentsByUser = await prisma.paymentClaim.findMany({
    where: { id: { in: refunds.map((r) => r.paymentId).filter((x): x is string => !!x) } },
  });
  const shareClaims = await prisma.paymentClaim.findMany({ where: { shareId: { in: refunds.map((r) => r.shareId).filter((x): x is string => !!x) }, status: "APPROVED" } });
  return (
    <div>
      <h1 className="h1">Refunds</h1>
      <p className="muted mt-1">Send the money back through bKash/Nagad yourself, then record the payout TrxID here. Each refund can be completed once.</p>
      <ul className="mt-4 space-y-3">
        {refunds.map((r) => {
          const orig = paymentsByUser.find((p) => p.id === r.paymentId) ?? shareClaims.find((p) => p.shareId === r.shareId);
          return (
            <li key={r.id} className="card" data-testid="refund">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <div className="text-lg font-bold">{takaPlain(r.amount)} · <span className={r.status === "PENDING" ? "text-orange-700" : "text-brand-700"}>{r.status}</span></div>
                  <div className="text-sm">{r.user.name} ({r.user.email})</div>
                  <div className="text-sm text-gray-600">{r.reason}{r.share ? ` — ${r.share.cycle.group.name}` : ""}</div>
                  {orig && <div className="text-sm">Original payment: {orig.provider} {orig.transactionId} from <span className="font-mono">{orig.senderNumber}</span></div>}
                  {r.status === "COMPLETED" && <div className="text-sm">Paid via {r.provider} · payout TrxID {r.payoutRef} · {r.adminNote}</div>}
                </div>
                {r.status === "PENDING" && (
                  <div className="w-full sm:w-80">
                    <ActionForm action={completeRefundAction} submitLabel="Mark refund sent" className="space-y-2" confirm="Confirm you have sent this refund?">
                      <input type="hidden" name="refundId" value={r.id} />
                      <select className="input text-sm" name="provider" defaultValue={orig?.provider ?? "BKASH"}>
                        <option value="BKASH">bKash</option>
                        <option value="NAGAD">Nagad</option>
                      </select>
                      <input className="input text-sm" name="payoutRef" placeholder="Payout TrxID (required)" required />
                      <input className="input text-sm" name="note" placeholder="Note" />
                    </ActionForm>
                  </div>
                )}
              </div>
            </li>
          );
        })}
        {refunds.length === 0 && <li className="card text-sm text-gray-500">No refunds.</li>}
      </ul>
    </div>
  );
}
