import Link from "next/link";
import { AppShell } from "@/components/AppShell";

export default function NotFound() {
  return (
    <AppShell>
      <div className="py-16 text-center">
        <div className="num text-5xl font-extrabold text-brand-600">404</div>
        <h1 className="mt-2 text-xl font-bold">পেজটি পাওয়া যায়নি</h1>
        <p className="muted mt-1">লিংকটি ভুল হতে পারে, অথবা পেজটি আর নেই।</p>
        <Link href="/" className="btn-primary mt-5">হোমে ফিরুন</Link>
      </div>
    </AppShell>
  );
}
