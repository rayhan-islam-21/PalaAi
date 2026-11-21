import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getUser } from "@/lib/session";
import { Calculator } from "@/components/Calculator";
import { AppShell } from "@/components/AppShell";
import { taka } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [settings, user] = await Promise.all([getSettings(prisma), getUser()]);
  return (
    <AppShell>
      <section className="pt-2">
        <h1 className="text-[28px] font-extrabold leading-tight">
          বন্ধুরা মিলে <span className="text-brand-700">Claude AI</span> ব্যবহার করুন — বিকাশ/নগদে টাকা দিয়ে
        </h1>
        <p className="mt-2 text-gray-600">
          ৪–৫ জন মিলে মাসিক AI বাজেট ভাগ করুন, প্রতিদিন নিজের নির্দিষ্ট সময়ে চ্যাট করুন। অথবা নিজের জন্য {taka(settings.topupAmounts[0] ?? 10000)} থেকে ক্রেডিট নিন।
        </p>
        <div className="mt-5 grid gap-3">
          <Link href={user ? "/groups/new" : "/signup?next=/groups/new"} className="btn-primary w-full py-3.5 text-lg">
            👥 গ্রুপ তৈরি করুন
          </Link>
          <Link href={user ? "/wallet" : "/signup?next=/wallet"} className="btn-secondary w-full py-3.5 text-lg">
            👛 নিজের জন্য ক্রেডিট নিন
          </Link>
          <Link href="/join" className="text-center text-base font-semibold text-brand-700 underline underline-offset-4">
            কোড দিয়ে গ্রুপে যোগ দিন →
          </Link>
          {user && <Link href="/dashboard" className="btn-ghost w-full">আমার ড্যাশবোর্ড</Link>}
        </div>
      </section>

      <section className="mt-6">
        <Calculator pool={settings.poolAmount} fee={settings.serviceFeePerMember} schedule4={settings.schedule4} schedule5={settings.schedule5} />
      </section>

      <section className="mt-6 card">
        <h2 className="h2">কীভাবে কাজ করে</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[15px] text-gray-700">
          <li>গ্রুপ তৈরি করে বন্ধুদের লিংক বা কোড পাঠান।</li>
          <li>প্রত্যেকে নিজের দৈনিক সময় বেছে নিয়ে নিজের অংশ বিকাশ/নগদে পাঠান।</li>
          <li>সবার পেমেন্ট যাচাই হলে ৩০ দিনের পাস চালু হয়।</li>
          <li>প্রত্যেকের আলাদা লগইন, আলাদা চ্যাট — কেউ কারো চ্যাট দেখতে পারে না।</li>
        </ol>
      </section>

      <section className="mt-4 rounded-2xl bg-gray-100 p-4 text-sm text-gray-600">
        <strong>জেনে রাখুন:</strong> Pala AI আমাদের নিজস্ব চ্যাট অ্যাপ, যা Anthropic-এর অফিসিয়াল API দিয়ে Claude মডেল ব্যবহার করে।
        এটি Claude Pro সাবস্ক্রিপশন নয় এবং claude.ai, Claude Code বা Pro ফিচারের অ্যাক্সেস দেয় না। কোনো অ্যাকাউন্ট বা পাসওয়ার্ড শেয়ার করা হয় না।
      </section>
    </AppShell>
  );
}
