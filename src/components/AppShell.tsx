import Link from "next/link";
import { getUser } from "@/lib/session";
import { SignOutButton } from "./SignOutButton";

const NAV = [
  { href: "/dashboard", label: "হোম", icon: "🏠" },
  { href: "/chat", label: "চ্যাট", icon: "💬" },
  { href: "/wallet", label: "ওয়ালেট", icon: "👛" },
  { href: "/groups", label: "গ্রুপ", icon: "👥" },
];

export async function AppShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  const user = await getUser();
  return (
    <div className="min-h-dvh pb-20 sm:pb-6">
      <header className="sticky top-0 z-20 border-b border-black/5 bg-white/90 backdrop-blur">
        <div className={`mx-auto flex h-14 items-center justify-between px-4 ${wide ? "max-w-6xl" : "max-w-2xl"}`}>
          <Link href={user ? "/dashboard" : "/"} className="text-lg font-extrabold text-brand-700">
            Pala<span className="text-gray-900"> AI</span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {user && NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-black/5">
                {n.label}
              </Link>
            ))}
            {user?.role === "ADMIN" && (
              <Link href="/admin" className="rounded-lg px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50">Admin</Link>
            )}
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                {user.role === "ADMIN" && <Link href="/admin" className="text-sm font-semibold text-amber-700 sm:hidden">Admin</Link>}
                <SignOutButton />
              </>
            ) : (
              <Link href="/login" className="btn-ghost min-h-9 py-1 text-sm">লগইন</Link>
            )}
          </div>
        </div>
      </header>
      <main className={`mx-auto px-4 py-4 ${wide ? "max-w-6xl" : "max-w-2xl"}`}>{children}</main>
      {user && (
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-black/10 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="flex flex-col items-center gap-0.5 py-2 text-xs font-medium text-gray-700">
              <span className="text-lg leading-none" aria-hidden>{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
