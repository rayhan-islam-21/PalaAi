import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { takaPlain } from "@/lib/money";
import { hasAnthropicKey, isDemoMode } from "@/lib/env";
import { enabledMethods } from "@/lib/services/payments";
import { MODEL_PRICES } from "@/lib/models";

/** Start of the current month in Asia/Dhaka, as a UTC instant. */
function dhakaMonthStart(now = new Date()) {
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit" }).format(now).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1) - 6 * 3600 * 1000);
}

async function money(since?: Date) {
  const where = since ? { createdAt: { gte: since } } : {};
  const [byKind, usage, newCustomers] = await Promise.all([
    prisma.ledgerEntry.groupBy({ by: ["kind"], where, _sum: { amount: true } }),
    prisma.chatRequest.aggregate({ where: { source: "WALLET", ...(since ? { createdAt: { gte: since } } : {}) }, _sum: { charged: true, providerCost: true }, _count: true }),
    prisma.user.count({ where: { role: "USER", ...(since ? { createdAt: { gte: since } } : {}) } }),
  ]);
  const k = (kind: string) => byKind.find((x) => x.kind === kind)?._sum.amount ?? 0;
  const charged = usage._sum.charged ?? 0;
  const cost = usage._sum.providerCost ?? 0;
  const bonus = k("BONUS_CREDIT") + k("ADMIN_CREDIT");
  // Bonus/free credit is not real money: count it as a cost when granted (conservative).
  return { collected: k("PAYMENT_IN"), charged, cost, bonus, profit: charged - cost - bonus, messages: usage._count, newCustomers };
}

export default async function AdminHome() {
  const monthStart = dhakaMonthStart();
  const [s, methods, pending, wallets, month, all, recent] = await Promise.all([
    getSettings(prisma),
    enabledMethods(prisma),
    prisma.paymentClaim.aggregate({ where: { status: "PENDING" }, _sum: { amount: true }, _count: true }),
    prisma.wallet.aggregate({ _sum: { balance: true, reserved: true } }),
    money(monthStart),
    money(),
    prisma.paymentClaim.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: { user: { select: { name: true, email: true } } } }),
  ]);
  const owed = (wallets._sum.balance ?? 0) + (wallets._sum.reserved ?? 0);
  const model = MODEL_PRICES.find((m) => m.id === s.modelId)?.label ?? s.modelId;
  const margin = (s.walletMarkupPercent / (100 + s.walletMarkupPercent)) * 100;

  const checks: { ok: boolean; text: string; href: string }[] = [
    { ok: methods.length > 0 && !methods.every((m) => m.isDemo), text: methods.length ? `Payments: ${methods.map((m) => m.provider + (m.isDemo ? " (demo number)" : "")).join(", ")}` : "No bKash/Nagad number set — customers can't pay", href: "/admin/settings" },
    { ok: isDemoMode() ? false : hasAnthropicKey(), text: isDemoMode() ? "DEMO MODE — mock AI, not real Claude" : hasAnthropicKey() ? "AI connected (Anthropic API key set)" : "No ANTHROPIC_API_KEY — chat is off", href: "/admin/settings" },
    { ok: !!(s.supportWhatsapp || s.supportEmail), text: s.supportWhatsapp || s.supportEmail ? `Support: ${[s.supportWhatsapp, s.supportEmail].filter(Boolean).join(" · ")}` : "No support contact — customers can't reach you", href: "/admin/settings" },
    { ok: s.walletMarkupPercent >= 25, text: `${model} · ৳${s.rates.usdToBdt}/$ · markup ${s.walletMarkupPercent}% (= ${margin.toFixed(0)}% profit)`, href: "/admin/settings" },
  ];

  const Stat = ({ label, value, hint, tone = "" }: { label: string; value: string; hint?: string; tone?: string }) => (
    <div className={`rounded-2xl border border-line bg-white p-4 ${tone}`}>
      <div className="text-[13px] text-mute">{label}</div>
      <div className="num mt-0.5 text-[22px] font-bold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-mute">{hint}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="h1">Dashboard</h1>

      {pending._count > 0 ? (
        <Link href="/admin/payments" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200 hover:bg-amber-100" data-testid="todo">
          <div>
            <div className="text-lg font-bold">{pending._count} payment{pending._count > 1 ? "s" : ""} waiting for your check</div>
            <div className="text-sm text-amber-900">{takaPlain(pending._sum.amount ?? 0)} — match each TrxID with your bKash/Nagad statement, then approve.</div>
          </div>
          <span className="btn-primary">Review payments →</span>
        </Link>
      ) : (
        <div className="rounded-2xl bg-brand-50 p-5 text-brand-900 ring-1 ring-brand-600/20" data-testid="todo">Nothing to do — no payments waiting.</div>
      )}

      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {checks.map((c) => (
          <li key={c.text}>
            <Link href={c.href} className={`flex items-start gap-2 rounded-xl p-3 text-sm ring-1 ${c.ok ? "bg-white ring-line" : "bg-red-50 ring-red-200"}`}>
              <span className={`mt-0.5 font-bold ${c.ok ? "text-brand-600" : "text-red-700"}`} aria-hidden>{c.ok ? "✓" : "!"}</span>
              <span>{c.text}</span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="space-y-2">
        <h2 className="h2">This month</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Money received" value={takaPlain(month.collected)} hint="Approved bKash/Nagad payments" />
          <Stat label="Customers used" value={takaPlain(month.charged)} hint={`${month.messages} AI replies`} />
          <Stat label="AI cost (Anthropic)" value={takaPlain(month.cost)} />
          <Stat label="Your profit" value={takaPlain(month.profit)} hint={`Used − AI cost − bonuses given (${takaPlain(month.bonus)})`} tone="bg-brand-50" />
          <Stat label="New customers" value={String(month.newCustomers)} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="h2">All time</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Money received" value={takaPlain(all.collected)} />
          <Stat label="Customers used" value={takaPlain(all.charged)} hint={`${all.messages} AI replies`} />
          <Stat label="AI cost (Anthropic)" value={takaPlain(all.cost)} />
          <Stat label="Your profit" value={takaPlain(all.profit)} hint={`after ${takaPlain(all.bonus)} bonuses`} tone="bg-brand-50" />
          <Stat label="Customer balances (owed)" value={takaPlain(owed)} hint="Paid but not used yet — keep this much (×0.75) in your Anthropic credit" tone="bg-amber-50" />
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="h2">Latest payments</h2>
          <Link href="/admin/payments?status=APPROVED" className="text-sm font-semibold text-brand-700">All payments →</Link>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="data-table">
            <thead><tr><th>Customer</th><th>Amount</th><th>Method</th><th>TrxID</th><th>Status</th></tr></thead>
            <tbody>
              {recent.map((c) => (
                <tr key={c.id}>
                  <td>{c.user.name}<div className="text-xs text-mute">{c.user.email}</div></td>
                  <td className="num">{takaPlain(c.amount)}</td>
                  <td>{c.provider}</td>
                  <td className="font-mono text-xs">{c.transactionId}</td>
                  <td className={c.status === "PENDING" ? "font-semibold text-amber-text" : c.status === "APPROVED" ? "text-brand-700" : "text-red-700"}>{c.status}</td>
                </tr>
              ))}
              {recent.length === 0 && <tr><td colSpan={5} className="text-mute">No payments yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
