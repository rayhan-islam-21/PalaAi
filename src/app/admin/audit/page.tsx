import { prisma } from "@/lib/db";

export default async function AdminAudit() {
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 300 });
  const actorIds = [...new Set(logs.map((l) => l.actorId).filter((x): x is string => !!x))];
  const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } });
  return (
    <div>
      <h1 className="h1">Audit log</h1>
      <div className="card mt-3 overflow-x-auto p-0">
        <table className="data-table">
          <thead><tr><th>Time (UTC)</th><th>Actor</th><th>Action</th><th>Entity</th><th>Data</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap">{l.createdAt.toISOString().slice(0, 19).replace("T", " ")}</td>
                <td>{actors.find((a) => a.id === l.actorId)?.email ?? "system"}</td>
                <td>{l.action}</td>
                <td className="font-mono text-xs">{l.entityType}:{l.entityId}</td>
                <td className="max-w-md break-all font-mono text-xs">{l.data ? JSON.stringify(l.data) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
