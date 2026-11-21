import Link from "next/link";
import { getUser } from "@/lib/session";
import { SignOutButton } from "./SignOutButton";
import { IconChat, IconHome, IconUsers, IconWallet, LogoMark } from "./Icons";

const NAV = [
  { href: "/dashboard", label: "হোম", Icon: IconHome },
  { href: "/chat", label: "চ্যাট", Icon: IconChat },
  { href: "/wallet", label: "ওয়ালেট", Icon: IconWallet },
  { href: "/groups", label: "গ্রুপ", Icon: IconUsers },
];

const PUBLIC_NAV = [
  { href: "/#pricing", label: "দাম" },
  { href: "/#how", label: "কীভাবে কাজ করে" },
  { href: "/#slots", label: "সময়সূচি" },
  { href: "/#faq", label: "প্রশ্ন" },
];

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 text-ink" aria-label="Pala AI">
      <LogoMark size={34} />
      <span className="num text-[20px] font-extrabold tracking-tight">
        Pala<span className="text-brand-600"> AI</span>
      </span>
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="bg-ink text-[#c9d6cf]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-5 py-9">
        <div className="max-w-xl space-y-1.5">
          <div className="num text-xl font-extrabold text-white">Pala AI</div>
          <p className="text-sm leading-relaxed">
            Anthropic API দিয়ে চালিত একটি স্বাধীন সেবা। Anthropic-এর সাথে কোনো অফিসিয়াল সম্পর্ক নেই। এটি Claude Pro সাবস্ক্রিপশন নয়।
          </p>
        </div>
        <div className="flex gap-5 text-[15px]">
          <Link href="/#faq" className="text-white hover:underline">প্রশ্ন</Link>
          <Link href="/join" className="text-white hover:underline">গ্রুপে যোগ দিন</Link>
          <Link href="/login" className="text-white hover:underline">লগইন</Link>
        </div>
      </div>
    </footer>
  );
}

export async function AppShell({
  children,
  wide = false,
  bare = false,
  footer = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
  /** Full-width page that manages its own sections (home page). */
  bare?: boolean;
  footer?: boolean;
}) {
  const user = await getUser();
  const width = wide || bare ? "max-w-6xl" : "max-w-2xl";
  return (
    <div className="flex min-h-dvh flex-col pb-[72px] sm:pb-0">
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className={`mx-auto flex h-16 items-center justify-between gap-3 px-4 ${width}`}>
          <Logo href={user ? "/dashboard" : "/"} />
          <nav className="hidden items-center gap-1 md:flex" aria-label="প্রধান মেনু">
            {(user ? NAV : PUBLIC_NAV).map((n) => (
              <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-[15px] font-medium text-ink-2 hover:bg-ground">
                {n.label}
              </Link>
            ))}
            {user?.role === "ADMIN" && (
              <Link href="/admin" className="rounded-lg px-3 py-2 text-[15px] font-semibold text-amber-text hover:bg-amber-50">Admin</Link>
            )}
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                {user.role === "ADMIN" && <Link href="/admin" className="text-sm font-semibold text-amber-text md:hidden">Admin</Link>}
                <SignOutButton />
              </>
            ) : (
              <>
                <Link href="/login" className="px-2 py-2 text-[15px] font-semibold text-ink">লগইন</Link>
                <Link href="/signup" className="hidden rounded-xl bg-ink px-4 py-2.5 text-[15px] font-semibold text-white sm:inline-flex">শুরু করুন</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className={bare ? "flex-1" : `mx-auto w-full flex-1 px-4 py-5 ${width}`}>{children}</main>
      {footer && <SiteFooter />}
      {user && (
        <nav aria-label="নিচের মেনু" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
          {NAV.map(({ href, label, Icon }) => (
            <Link key={href} href={href} className="flex flex-col items-center gap-0.5 py-2 text-xs font-medium text-mute">
              <Icon size={22} />
              {label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
