import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ActionForm } from "@/components/ActionForm";
import { takaPlain } from "@/lib/money";
import type { Slot } from "@/lib/slots";
import { adminCancelGroupAction } from "../../actions";

export default async function AdminGroup({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await prisma.group.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true, email: true } },
      memberships: { include: { user: { select: { name: true, email: true } } }, orderBy: { slotIndex: "asc" } },
      cycles: { orderBy: { cycleNumber: "desc" }, include: { shares: { include: { payments: true, refunds: true } } } },
    },
  });
  if (!g) notFound();
  const schedule = g.schedule as Slot[];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="h1">{g.name} <span className="text-base font-normal text-gray-500">({g.status})</span></h1>
        <p className="muted">Owner {g.owner.name} ({g.owner.email}) · {g.seatCount} seats · code {g.inviteCode}</p>
        <p className="muted">Admins see membership and payment status only — never members&apos; chats.</p>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="data-table">
          <thead><tr><th>Slot</th><th>Member</th><th>Status</th><th>Joined</th></tr></thead>
          <tbody>
            {g.memberships.map((m) => (
              <tr key={m.id}><td>{schedule[m.slotIndex]?.start}–{schedule[m.slotIndex]?.end}</td><td>{m.user.name} ({m.user.email})</td><td>{m.status}</td><td>{m.joinedAt.toISOString().slice(0, 10)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {g.cycles.map((c) => (
        <div key={c.id} className="card">
          <h2 className="h2">Cycle #{c.cycleNumber} — {c.status}</h2>
          <p className="text-sm">Locked quote: pool {takaPlain(c.poolAmount)}, usage {takaPlain(c.sharePerMember)} + fee {takaPlain(c.feePerMember)} = {takaPlain(c.pricePerMember)} per member{c.startsAt ? ` · ${c.startsAt.toISOString().slice(0, 10)} → ${c.endsAt?.toISOString().slice(0, 10)}` : ""}</p>
          <div className="mt-2 overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Member</th><th>Share</th><th>Due</th><th>Allowance left</th><th>Payments</th><th>Refunds</th></tr></thead>
              <tbody>
                {c.shares.map((s) => (
                  <tr key={s.id}>
                    <td>{g.memberships.find((m) => m.id === s.membershipId)?.user.name}</td>
                    <td>{s.status}</td>
                    <td>{takaPlain(s.amountDue)}</td>
                    <td>{takaPlain(s.remaining)} / {takaPlain(s.allowance)}</td>
                    <td>{s.payments.map((p) => `${p.provider} ${p.transactionId} ${p.status}`).join("; ") || "-"}</td>
                    <td>{s.refunds.map((r) => `${takaPlain(r.amount)} ${r.status}`).join("; ") || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {(g.status === "FORMING" || g.status === "EXPIRED") && (
        <div className="card max-w-md">
          <h2 className="h2">Cancel group</h2>
          <p className="muted">Paid shares become refunds owed.</p>
          <ActionForm action={adminCancelGroupAction} submitLabel="Cancel group" submitClass="btn-danger w-full" confirm="Cancel this group? This cannot be undone.">
            <input type="hidden" name="groupId" value={g.id} />
            <input className="input" name="reason" placeholder="Reason" required />
          </ActionForm>
        </div>
      )}
    </div>
  );
}
