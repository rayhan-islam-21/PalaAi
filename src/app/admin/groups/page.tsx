import Link from "next/link";
import { prisma } from "@/lib/db";
import { takaPlain } from "@/lib/money";

export default async function AdminGroups() {
  const groups = await prisma.group.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      owner: { select: { name: true } },
      memberships: { where: { status: "ACTIVE" } },
      cycles: { orderBy: { cycleNumber: "desc" }, take: 1, include: { shares: true } },
    },
  });
  return (
    <div>
      <h1 className="h1">Groups</h1>
      <div className="card mt-3 overflow-x-auto p-0">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Owner</th><th>Status</th><th>Seats</th><th>Paid</th><th>Price</th><th>Cycle</th><th>Code</th></tr></thead>
          <tbody>
            {groups.map((g) => {
              const c = g.cycles[0];
              return (
                <tr key={g.id}>
                  <td><Link className="font-semibold text-brand-700 underline" href={`/admin/groups/${g.id}`}>{g.name}</Link></td>
                  <td>{g.owner.name}</td>
                  <td>{g.status}</td>
                  <td>{g.memberships.length}/{g.seatCount}</td>
                  <td>{c ? c.shares.filter((s) => s.status === "PAID").length : 0}</td>
                  <td>{c ? takaPlain(c.pricePerMember) : "-"}</td>
                  <td>{c ? `#${c.cycleNumber} ${c.status}${c.endsAt ? ` → ${c.endsAt.toISOString().slice(0, 10)}` : ""}` : "-"}</td>
                  <td className="font-mono">{g.inviteCode}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
