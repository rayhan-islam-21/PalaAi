import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { PackPicker } from "@/components/PackPicker";
import { IconCheck, IconChart, IconClock, IconLock } from "@/components/Icons";
import { takaPrecise, taka, bnNum } from "@/lib/money";
import { approxMessages, exampleCharges } from "@/lib/estimates";
import { topupBonus } from "@/lib/packs";

export const dynamic = "force-dynamic";

const FAQ = [
  ["এটা কি Claude Pro সাবস্ক্রিপশন?", "না। Pala AI আমাদের নিজস্ব চ্যাট অ্যাপ, Anthropic-এর অফিসিয়াল API দিয়ে Claude চালায়। claude.ai বা Pro ফিচারের অ্যাক্সেস দেয় না, কোনো অ্যাকাউন্ট শেয়ার করা হয় না।"],
  ["প্রতি মেসেজে কত টাকা কাটে?", "AI যতটুকু লেখা পড়ে ও লেখে সেই হিসাবে — ছোট প্রশ্নে এক টাকারও কম, লম্বা লেখা বা কোডে কয়েক টাকা। প্রতিটি উত্তরের নিচে ঠিক কত কাটল দেখা যায়।"],
  ["বোনাস কীভাবে পাব?", "বড় প্যাকে বেশি বোনাস। প্রথম টপ-আপে আলাদা বোনাস — প্যাকের বোনাস আর প্রথম বোনাসের মধ্যে যেটা বেশি সেটা পাবেন। পেমেন্ট অনুমোদনের সাথে সাথে যোগ হয়।"],
  ["পেমেন্ট কীভাবে যাচাই হয়?", "বিকাশ/নগদে টাকা পাঠিয়ে ট্রানজ্যাকশন আইডি দিন। আমরা স্টেটমেন্ট মিলিয়ে অনুমোদন দিলেই ব্যালান্স যোগ হয়।"],
];

export default async function Home() {
  const [settings, user] = await Promise.all([getSettings(prisma), getUser()]);
  const firstTopup = !user || (await prisma.paymentClaim.count({ where: { userId: user.id, purpose: "WALLET_TOPUP", status: "APPROVED" } })) === 0;
  const examples = exampleCharges(settings);
  const minTopup = Math.min(...settings.topupAmounts);
  const packs = settings.packs.map((p) => {
    const bonus = topupBonus(p.amount, p, firstTopup, settings).bonus;
    return { amount: p.amount, name: p.name, bonus, credits: p.amount + bonus, messages: approxMessages(settings, p.amount + bonus) };
  });
  const firstPct = firstTopup && settings.firstTopupBonusPercent > 0 ? settings.firstTopupBonusPercent : 0;

  return (
    <AppShell bare footer>
      {/* Hero */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-14 pt-10 lg:grid-cols-[1.15fr_1fr] lg:pb-24 lg:pt-20">
          <div className="space-y-6">
            <h1 className="text-[34px] font-bold leading-[1.2] sm:text-[46px] lg:text-[54px] lg:leading-[1.15]">
              Claude AI, <span className="text-brand-600">লিমিটের অপেক্ষা ছাড়া।</span>
            </h1>
            <p className="max-w-lg text-[17px] leading-relaxed text-mute lg:text-[19px]">
              {taka(minTopup)} থেকে ক্রেডিট কিনুন বিকাশ বা নগদে। যতটুকু ব্যবহার, ততটুকুই খরচ — মাসিক চার্জ নেই।
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href={user ? "/wallet" : "/signup?next=/wallet"} className="btn-primary min-h-[54px] px-7 text-[17px]">
                শুরু করুন{firstPct ? ` — +${bnNum(firstPct)}% বোনাস` : ""}
              </Link>
              <Link href="#pricing" className="btn-ghost min-h-[54px] px-5 text-[16px] text-ink-2">দাম দেখুন →</Link>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[14.5px] text-mute">
              {["অফিসিয়াল Anthropic API", "প্রাইভেট চ্যাট", "ব্যর্থ উত্তরে টাকা কাটে না"].map((t) => (
                <li key={t} className="flex items-center gap-1.5"><IconCheck size={15} className="text-brand-600" />{t}</li>
              ))}
            </ul>
          </div>

          <div className="mx-auto w-full max-w-[380px]" aria-hidden>
            <div className="rounded-[26px] bg-ink p-3 shadow-[0_30px_70px_-20px_rgba(16,35,28,0.35)]">
              <div className="overflow-hidden rounded-[18px] bg-white">
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <span className="text-[13px] font-semibold">Pala AI</span>
                  <span className="num rounded-full bg-mint px-2.5 py-0.5 text-[12px] font-semibold text-brand-900">ব্যালান্স {taka(25000)}</span>
                </div>
                <div className="space-y-3 bg-ground p-4">
                  <div className="ml-auto max-w-[80%] rounded-[16px_16px_4px_16px] bg-brand-600 px-3 py-2 text-[14px] leading-normal text-white">একটা ছুটির দরখাস্ত লিখে দাও</div>
                  <div className="max-w-[88%] rounded-[16px_16px_16px_4px] bg-white px-3 py-2 text-[14px] leading-normal text-ink-2 ring-1 ring-line">
                    বরাবর, প্রধান শিক্ষক…<br />বিষয়: এক দিনের ছুটির আবেদন।
                  </div>
                  <div className="text-[11.5px] text-mute">খরচ {takaPrecise(examples[1].charge)} · বাকি {taka(25000 - examples[1].charge)}</div>
                </div>
                <div className="px-4 py-3">
                  <div className="flex h-10 items-center rounded-xl px-3 text-[13px] text-mute ring-1 ring-line">এখানে লিখুন…</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Three simple points */}
      <section className="mx-auto max-w-6xl px-5 py-14 lg:py-20">
        <div className="grid gap-8 sm:grid-cols-3">
          {[
            [IconClock, "লিমিটের অপেক্ষা নেই", "ব্যালান্স থাকলে যখন খুশি ব্যবহার করুন। দৈনিক কোনো সীমা নেই।"],
            [IconChart, "খরচ সবসময় পরিষ্কার", "প্রতিটি উত্তরের নিচে কত টাকা কাটল আর কত বাকি, দেখতে পাবেন।"],
            [IconLock, "আপনার নিজের অ্যাকাউন্ট", "প্রাইভেট চ্যাট, পাসওয়ার্ড শেয়ার নয়। ব্যালান্সের মেয়াদ নেই।"],
          ].map(([Icon, t, d]) => {
            const I = Icon as typeof IconClock;
            return (
              <div key={t as string} className="space-y-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-mint"><I size={20} className="text-brand-600" /></span>
                <h3 className="text-[18px] font-bold">{t as string}</h3>
                <p className="text-[15px] leading-relaxed text-mute">{d as string}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 bg-white">
        <div className="mx-auto max-w-4xl space-y-8 px-5 py-14 lg:py-20">
          <div className="space-y-2 text-center">
            <h2 className="text-[28px] font-bold lg:text-4xl">সহজ দাম</h2>
            <p className="text-[16px] text-mute">একবার কিনুন, যখন খুশি ব্যবহার করুন। বড় প্যাকে বেশি বোনাস।</p>
            {firstPct > 0 && (
              <p className="text-[15px] font-semibold text-brand-700" data-testid="first-bonus">
                প্রথম টপ-আপে +{bnNum(firstPct)}% বোনাস (সর্বোচ্চ {taka(settings.firstTopupBonusCap)})
              </p>
            )}
          </div>
          <PackPicker packs={packs} loggedIn={!!user} defaultIndex={2} />
          <div className="rounded-2xl bg-ground p-5">
            <h3 className="mb-2 text-[15px] font-bold">কোন কাজে কত খরচ (আনুমানিক)</h3>
            <ul className="divide-y divide-line text-[15px]">
              {examples.map((e) => (
                <li key={e.key} className="flex items-center justify-between gap-3 py-2.5">
                  <span>{e.label}</span>
                  <span className="num font-semibold">≈ {takaPrecise(e.charge)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12.5px] text-mute">বাংলা উত্তর ও লম্বা চ্যাটে খরচ একটু বেশি। প্যাকের মেসেজ সংখ্যা রক্ষণশীল অনুমান।</p>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="mx-auto max-w-4xl space-y-6 px-5 py-14 lg:py-20">
        <h2 className="text-center text-[28px] font-bold lg:text-4xl">মাসিক প্ল্যানের সাথে তুলনা</h2>
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-line" data-testid="comparison">
          <div className="grid grid-cols-[1.1fr_1fr_1fr] border-b border-line bg-ground px-4 py-3 text-[13.5px] font-semibold text-mute">
            <span></span><span className="text-brand-700">Pala AI</span><span>সাধারণ মাসিক প্ল্যান</span>
          </div>
          {[
            ["শুরু", `${taka(minTopup)} একবার`, "৳৪০০+ প্রতি মাসে"],
            ["দৈনিক লিমিট", "নেই", "আছে"],
            ["না-ব্যবহৃত টাকা", "থেকে যায়", "মাস শেষে বাতিল"],
            ["খরচ দেখা", "প্রতি উত্তরে", "অস্পষ্ট"],
          ].map(([k, a, b]) => (
            <div key={k} className="grid grid-cols-[1.1fr_1fr_1fr] items-center border-b border-line px-4 py-3.5 text-[15px] last:border-0">
              <span className="font-semibold">{k}</span>
              <span className="flex items-center gap-1.5 font-semibold text-ink"><IconCheck size={15} className="shrink-0 text-brand-600" />{a}</span>
              <span className="text-mute">{b}</span>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 bg-white">
        <div className="mx-auto max-w-6xl space-y-8 px-5 py-14 lg:py-20">
          <h2 className="text-center text-[28px] font-bold lg:text-4xl">৩ ধাপে শুরু</h2>
          <ol className="grid gap-8 sm:grid-cols-3">
            {[
              ["অ্যাকাউন্ট খুলুন", "ইমেইল আর পাসওয়ার্ড দিয়ে এক মিনিটে।"],
              ["বিকাশ/নগদে টপ-আপ", "টাকা পাঠিয়ে TrxID দিন — যাচাই হলেই ব্যালান্স।"],
              ["চ্যাট শুরু", "বাংলা, ইংরেজি বা বাংলিশে যা খুশি জিজ্ঞেস করুন।"],
            ].map(([t, d], i) => (
              <li key={t} className="space-y-2">
                <span className="num flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-[15px] font-bold text-white">{i + 1}</span>
                <h3 className="text-[18px] font-bold">{t}</h3>
                <p className="text-[15px] leading-relaxed text-mute">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 space-y-3 px-5 py-14 lg:py-20">
        <h2 className="pb-3 text-center text-[28px] font-bold lg:text-4xl">সাধারণ প্রশ্ন</h2>
        {FAQ.map(([qn, a]) => (
          <details key={qn} className="group rounded-2xl bg-white px-5 py-4 ring-1 ring-line">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[16px] font-semibold">
              {qn}<span className="text-xl text-brand-600 transition group-open:rotate-45" aria-hidden>+</span>
            </summary>
            <p className="mt-2 text-[15px] leading-relaxed text-mute">{a}</p>
          </details>
        ))}
        <p className="pt-2 text-center text-[14px] text-mute">আরও প্রশ্ন? <Link href="/support" className="font-semibold text-brand-700">সাপোর্টে লিখুন</Link></p>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="flex flex-col items-start gap-5 rounded-[24px] bg-ink p-8 text-white lg:flex-row lg:items-center lg:justify-between lg:p-12">
          <div className="space-y-1.5">
            <h2 className="text-[26px] font-bold lg:text-3xl">আজই শুরু করুন</h2>
            <p className="text-[#c9d6cf]">এক মিনিটে অ্যাকাউন্ট, {taka(minTopup)} দিয়েই শুরু।</p>
          </div>
          <Link href={user ? "/dashboard" : "/signup"} className="btn min-h-[52px] bg-white px-7 text-[17px] text-ink hover:bg-brand-50">
            {user ? "আমার ড্যাশবোর্ড" : "ফ্রি অ্যাকাউন্ট খুলুন"}
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
