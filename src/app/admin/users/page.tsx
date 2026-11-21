import { prisma } from "@/lib/db";
import { takaPlain } from "@/lib/money";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const users = await prisma.user.findMany({
    where: q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      wallet: true,
      memberships: { where: { status: "ACTIVE" }, include: { group: { select: { name: true, status: true } } } },
      _count: { select: { payments: true, conversations: true } },
    },
  });
  return (
    <div>
      <h1 className="h1">Customers</h1>
      <form className="mt-3 flex max-w-md gap-2">
        <input className="input" name="q" defaultValue={q} placeholder="Search name or email" />
        <button className="btn-secondary">Search</button>
      </form>
      <div className="card mt-3 overflow-x-auto p-0">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Wallet</th><th>Reserved</th><th>Groups</th><th>Payments</th><th>Chats</th><th>Joined</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{takaPlain(u.wallet?.balance ?? 0)}</td>
                <td>{takaPlain(u.wallet?.reserved ?? 0)}</td>
                <td>{u.memberships.map((m) => `${m.group.name} (${m.group.status})`).join(", ") || "-"}</td>
                <td>{u._count.payments}</td>
                <td>{u._count.conversations}</td>
                <td>{u.createdAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted mt-2">Chat contents are private and are not shown in the admin panel.</p>
    </div>
  );
}
