import { prisma } from "@/lib/db";
import { ActionForm } from "@/components/ActionForm";
import { takaPlain } from "@/lib/money";
import { releaseStaleAction } from "../actions";

export default async function AdminLedger() {
  const [kinds, entries, requests] = await Promise.all([
    prisma.ledgerEntry.groupBy({ by: ["kind"], _sum: { amount: true }, _count: true, orderBy: { kind: "asc" } }),
    prisma.ledgerEntry.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.chatRequest.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { email: true } } } }),
  ]);
  return (
    <div className="space-y-5">
      <h1 className="h1">Usage & ledger</h1>
      <div className="card overflow-x-auto p-0">
        <table className="data-table">
          <thead><tr><th>Ledger kind</th><th>Entries</th><th>Total</th></tr></thead>
          <tbody>{kinds.map((k) => <tr key={k.kind}><td>{k.kind}</td><td>{k._count}</td><td>{takaPlain(k._sum.amount ?? 0)}</td></tr>)}</tbody>
        </table>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <h2 className="h2">Chat usage (no message content)</h2>
          <div className="w-64"><ActionForm action={releaseStaleAction} submitLabel="Release stale reservations" submitClass="btn-secondary w-full text-sm" /></div>
        </div>
        <div className="card mt-2 overflow-x-auto p-0">
          <table className="data-table">
            <thead><tr><th>Time (UTC)</th><th>User</th><th>Source</th><th>Provider/model</th><th>Tokens in/out</th><th>Reserved</th><th>Charged</th><th>Our cost</th><th>Status</th></tr></thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>{r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td>{r.user.email}</td>
                  <td>{r.source}</td>
                  <td>{r.provider} / {r.model}</td>
                  <td>{r.inputTokens} / {r.outputTokens} (cap {r.maxTokens})</td>
                  <td>{takaPlain(r.reserved)}</td>
                  <td>{takaPlain(r.charged)}{r.absorbed ? ` (+${takaPlain(r.absorbed)} absorbed)` : ""}</td>
                  <td>{takaPlain(r.providerCost)}</td>
                  <td>{r.status}{r.error ? ` — ${r.error}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h2 className="h2">Recent ledger entries</h2>
        <div className="card mt-2 overflow-x-auto p-0">
          <table className="data-table">
            <thead><tr><th>Time (UTC)</th><th>Kind</th><th>Amount</th><th>Ref</th><th>Memo</th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}><td>{e.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td><td>{e.kind}</td><td>{takaPlain(e.amount)}</td><td className="font-mono text-xs">{e.refType}:{e.refId}</td><td>{e.memo}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
