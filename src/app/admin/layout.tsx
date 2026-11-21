import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { GROUPS_ENABLED } from "@/lib/features";

const TABS: [string, string][] = [
  ["/admin", "Dashboard"],
  ["/admin/payments", "Payments"],
  ["/admin/users", "Customers"],
  ["/admin/ledger", "Usage"],
  ["/admin/tokens", "Token calculator"],
  ["/admin/settings", "Settings"],
  ...(GROUPS_ENABLED ? ([["/admin/refunds", "Refunds"], ["/admin/groups", "Groups"]] as [string, string][]) : []),
  ["/admin/audit", "Activity log"],
];

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const pending = await prisma.paymentClaim.count({ where: { status: "PENDING" } });
  return (
    <AppShell wide>
      <nav aria-label="Admin" className="mb-5 flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map(([href, label]) => (
          <Link key={href} href={href} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium ring-1 ring-line hover:bg-brand-50">
            {label}
            {href === "/admin/payments" && pending > 0 && (
              <span className="num rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">{pending}</span>
            )}
          </Link>
        ))}
      </nav>
      {children}
    </AppShell>
  );
}
