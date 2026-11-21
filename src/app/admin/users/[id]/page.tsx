import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ActionForm } from "@/components/ActionForm";
import { takaPlain } from "@/lib/money";
import { adjustWalletAction, resetUserPasswordAction, setUserDisabledAction } from "../../actions";

export default async function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await prisma.user.findUnique({
    where: { id },
    include: {
      wallet: { include: { transactions: { orderBy: { createdAt: "desc" }, take: 30 } } },
      payments: { orderBy: { createdAt: "desc" }, take: 20 },
      _count: { select: { conversations: true } },
    },
  });
  if (!u) notFound();
  const usage = await prisma.chatRequest.aggregate({ where: { userId: id }, _sum: { charged: true, providerCost: true }, _count: true });
  const fmt = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");
  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/users" className="text-sm text-brand-700">← Customers</Link>
        <h1 className="h1 mt-1">{u.name} {u.disabled && <span className="badge bg-red-100 text-red-700 align-middle">{u.deletedAt ? "DELETED" : "BLOCKED"}</span>}</h1>
        <p className="muted">{u.email}{u.phone ? ` · ${u.phone}` : ""} · joined {u.createdAt.toISOString().slice(0, 10)} · role {u.role}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card"><div className="text-xs text-mute">Balance</div><div className="num text-xl font-bold">{takaPlain(u.wallet?.balance ?? 0)}</div></div>
        <div className="card"><div className="text-xs text-mute">Used (charged)</div><div className="num text-xl font-bold">{takaPlain(usage._sum.charged ?? 0)}</div><div className="text-xs text-mute">{usage._count} replies</div></div>
        <div className="card"><div className="text-xs text-mute">AI cost</div><div className="num text-xl font-bold">{takaPlain(usage._sum.providerCost ?? 0)}</div></div>
        <div className="card"><div className="text-xs text-mute">Chats</div><div className="num text-xl font-bold">{u._count.conversations}</div><div className="text-xs text-mute">content is private</div></div>
      </div>

      {!u.deletedAt && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="card space-y-2">
            <h2 className="h2">Adjust balance</h2>
            <p className="muted">For goodwill credit or fixing a mistake. The customer sees the reason in their history.</p>
            <ActionForm action={adjustWalletAction} submitLabel="Apply" submitClass="btn-primary">
              <input type="hidden" name="userId" value={u.id} />
              <div className="flex gap-2">
                <select name="direction" className="input w-32" aria-label="Direction"><option value="credit">Add</option><option value="debit">Remove</option></select>
                <input name="amount" className="input" placeholder="৳ amount" inputMode="decimal" required aria-label="Amount in taka" />
              </div>
              <input name="reason" className="input" placeholder="Reason (required)" required aria-label="Reason" />
            </ActionForm>
          </section>
          <section className="card space-y-2">
            <h2 className="h2">Forgot password</h2>
            <p className="muted">Creates a temporary password and signs the customer out everywhere. Verify their identity first.</p>
            <ActionForm action={resetUserPasswordAction} submitLabel="Create temporary password" submitClass="btn-secondary" confirm="Reset this customer's password?">
              <input type="hidden" name="userId" value={u.id} />
            </ActionForm>
          </section>
          <section className="card space-y-2">
            <h2 className="h2">{u.disabled ? "Unblock account" : "Block account"}</h2>
            <p className="muted">{u.disabled ? "Lets the customer sign in and chat again." : "Signs the customer out and stops all chat. Balance is kept."}</p>
            <ActionForm action={setUserDisabledAction} submitLabel={u.disabled ? "Unblock" : "Block"} submitClass={u.disabled ? "btn-secondary" : "btn-danger"} confirm={u.disabled ? undefined : "Block this account?"}>
              <input type="hidden" name="userId" value={u.id} />
              <input type="hidden" name="disabled" value={u.disabled ? "false" : "true"} />
            </ActionForm>
          </section>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="h2">Wallet history</h2>
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="data-table">
            <thead><tr><th>Time (UTC)</th><th>Type</th><th>Amount</th><th>Balance after</th><th>Note</th></tr></thead>
            <tbody>
              {(u.wallet?.transactions ?? []).map((t) => (
                <tr key={t.id}><td>{fmt(t.createdAt)}</td><td>{t.type}</td><td className={`num ${t.amount < 0 ? "text-red-700" : "text-brand-700"}`}>{takaPlain(t.amount)}</td><td className="num">{takaPlain(t.balanceAfter)}</td><td className="text-xs">{t.note}</td></tr>
              ))}
              {!u.wallet?.transactions.length && <tr><td colSpan={5} className="text-mute">No transactions.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="h2">Payments</h2>
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="data-table">
            <thead><tr><th>Time (UTC)</th><th>Amount</th><th>Method</th><th>TrxID</th><th>From</th><th>Status</th></tr></thead>
            <tbody>
              {u.payments.map((p) => (
                <tr key={p.id}><td>{fmt(p.createdAt)}</td><td className="num">{takaPlain(p.amount)}</td><td>{p.provider}</td><td className="font-mono text-xs">{p.transactionId}</td><td className="font-mono text-xs">{p.senderNumber}</td><td>{p.status}</td></tr>
              ))}
              {u.payments.length === 0 && <tr><td colSpan={6} className="text-mute">No payments.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
