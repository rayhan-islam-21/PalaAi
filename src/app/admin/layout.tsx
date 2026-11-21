import { GROUPS_ENABLED } from "@/lib/features";
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { AppShell } from "@/components/AppShell";

const TABS = [
  ["/admin", "Overview"],
  ["/admin/payments", "Payments"],
  ...(GROUPS_ENABLED ? [["/admin/refunds", "Refunds"], ["/admin/groups", "Groups"]] : []),
  ["/admin/users", "Customers"],
  ["/admin/ledger", "Usage & ledger"],
  ["/admin/tokens", "Token calculator"],
  ["/admin/settings", "Settings"],
  ["/admin/audit", "Audit log"],
];

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <AppShell wide>
      <div className="mb-4 flex gap-1 overflow-x-auto pb-1">
        {TABS.map(([href, label]) => (
          <Link key={href} href={href} className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-sm font-medium ring-1 ring-black/5 hover:bg-brand-50">
            {label}
          </Link>
        ))}
      </div>
      {children}
    </AppShell>
  );
}
