import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { Calculator } from "@/components/Calculator";
import { JoinCodeForm } from "@/components/JoinCodeForm";
import { IconChart, IconCheck, IconClock, IconLang, IconLock, IconPhone, IconRefund, IconShield, IconUsers, IconWallet } from "@/components/Icons";
import { goToCodeAction } from "@/app/actions";
import { groupQuote } from "@/lib/pricing";
import { taka } from "@/lib/money";

export const dynamic = "force-dynamic";

const STEPS = [
  ["গ্রুপ তৈরি করুন", "৪ বা ৫ জন বেছে নিন, নিজের দৈনিক সময় নিন।"],
  ["বন্ধুদের আমন্ত্রণ", "কোড বা লিংক WhatsApp/Messenger-এ পাঠান।"],
  ["নিজের অংশ পেমেন্ট", "বিকাশ/নগদে পাঠিয়ে TrxID জমা দিন, আমরা মিলিয়ে নিই।"],
  ["৩০ দিনের পাস চালু", "সবার পেমেন্ট যাচাই হলেই শুরু — নিজের সময়ে চ্যাট করুন।"],
];

const WHY = [
  [IconShield, "পাসওয়ার্ড শেয়ার নয়", "প্রত্যেকের নিজের অ্যাকাউন্ট ও লগইন।"],
  [IconLock, "প্রাইভেট চ্যাট", "গ্রুপের কেউ আপনার চ্যাট দেখতে পারে না।"],
  [IconChart, "টোকেন হিসেবে খরচ", "প্রতিটি উত্তরের খরচ ও বাকি ব্যালান্স দেখুন।"],
  [IconClock, "ন্যায্য সময় ভাগ", "সার্ভার প্রতিটি মেসেজে আপনার সময় যাচাই করে।"],
  [IconRefund, "টাকা ফেরতের নিশ্চয়তা", "গ্রুপ বাতিল হলে যারা দিয়েছেন তারা ফেরত পান।"],
  [IconLang, "বাংলায় সহজ", "বাংলা, ইংরেজি বা বাংলিশে প্রশ্ন করুন।"],
] as const;

const FAQ = [
  ["এটা কি Claude Pro সাবস্ক্রিপশন?", "না। Pala AI আমাদের নিজস্ব চ্যাট অ্যাপ, Anthropic-এর অফিসিয়াল API দিয়ে Claude মডেল চালায়। claude.ai, Claude Code বা Pro ফিচারের অ্যাক্সেস দেয় না, আর কোনো অ্যাকাউন্ট বা পাসওয়ার্ড শেয়ার করা হয় না।"],
  ["পেমেন্ট কীভাবে যাচাই হয়?", "আপনি বিকাশ/নগদে টাকা পাঠিয়ে ট্রানজ্যাকশন আইডি জমা দেন। আমরা আমাদের স্টেটমেন্টের সাথে মিলিয়ে অনুমোদন দিই। অবস্থা আপনার পেমেন্ট পেজে দেখা যায়।"],
  ["সবাই টাকা না দিলে কী হবে?", "সব সিট পূর্ণ ও সবার পেমেন্ট যাচাই না হওয়া পর্যন্ত পাস চালু হয় না। যারা এখনো টাকা দেননি তারা গ্রুপ ছাড়তে পারেন। গ্রুপ বাতিল হলে যারা দিয়েছেন তারা টাকা ফেরত পান।"],
  ["আমার সময়ের বাইরে চ্যাট করা যাবে?", "হ্যাঁ, নিজের পার্সোনাল ওয়ালেট থেকে — তবে শুধু আপনি নিজে বেছে নিলেই। আমরা কখনো না জানিয়ে ওয়ালেট থেকে টাকা কাটি না।"],
  ["মাস শেষে কী হবে?", "রিনিউ করার অপশন পাবেন। আপনার আগের সব চ্যাট থেকে যাবে।"],
];

export default async function Home() {
  const [settings, user] = await Promise.all([getSettings(prisma), getUser()]);
  const q4 = groupQuote(settings.poolAmount, 4, settings.serviceFeePerMember);
  const q5 = groupQuote(settings.poolAmount, 5, settings.serviceFeePerMember);
  const minTopup = Math.min(...settings.topupAmounts);
  const createHref = user ? "/groups/new" : "/signup?next=/groups/new";
  const walletHref = user ? "/wallet" : "/signup?next=/wallet";

  return (
    <AppShell bare footer>
      {/* Hero */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-12 pt-8 lg:grid-cols-[1.25fr_1fr] lg:gap-12 lg:pb-20 lg:pt-16">
          <div className="space-y-5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-mint px-3 py-1.5 text-[13px] font-semibold text-brand-900">
              <IconCheck size={14} className="text-brand-600" /> অফিসিয়াল Anthropic API দিয়ে চালিত
            </span>
            <h1 className="text-[31px] font-bold leading-[1.25] sm:text-[44px] lg:text-[52px] lg:leading-[1.18]">
              বন্ধুরা মিলে Claude AI — <span className="text-brand-600">খরচ ভাগ, বিকাশে পেমেন্ট</span>
            </h1>
            <p className="max-w-xl text-[16.5px] leading-relaxed text-[#42524b] lg:text-[19px]">
              ৪–৫ জনের গ্রুপে মাসিক AI বাজেট ভাগ করুন। প্রত্যেকে পাবেন আলাদা লগইন, প্রাইভেট চ্যাট আর প্রতিদিন নিজের নির্দিষ্ট সময়। চাইলে নিজের জন্য {taka(minTopup)} থেকে ক্রেডিটও নিন।
            </p>
            <div className="grid gap-2.5 sm:flex sm:flex-wrap">
              <Link href={createHref} className="flex min-h-[54px] items-center justify-center gap-2 rounded-[14px] bg-brand-600 px-6 text-[17px] font-bold text-white hover:bg-brand-700">
                <IconUsers size={20} /> গ্রুপ তৈরি করুন
              </Link>
              <Link href={walletHref} className="flex min-h-[54px] items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-brand-600 bg-white px-6 text-[17px] font-bold text-brand-900 hover:bg-brand-50">
                <IconWallet size={20} /> নিজের জন্য ক্রেডিট নিন
              </Link>
            </div>
            <div className="max-w-md">
              <JoinCodeForm action={goToCodeAction} />
            </div>
            <ul className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-5">
              {[[IconPhone, "বিকাশ ও নগদে পেমেন্ট"], [IconLock, "প্রত্যেকের প্রাইভেট চ্যাট"], [IconRefund, "গ্রুপ না হলে টাকা ফেরত"]].map(([I, t]) => {
                const Ic = I as typeof IconPhone;
                return (
                  <li key={t as string} className="flex flex-col items-center gap-1 rounded-xl bg-ground px-1 py-2.5 text-center text-[12.5px] leading-snug text-ink-2 sm:flex-row sm:bg-transparent sm:p-0 sm:text-[15px]">
                    <Ic size={19} className="text-brand-600" /> {t as string}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Product preview (illustrative) */}
          <div className="hidden justify-center lg:flex" aria-hidden>
            <div className="w-full max-w-[400px] rounded-[28px] bg-ink p-3.5 shadow-[0_24px_60px_rgba(16,35,28,0.18)]">
              <div className="overflow-hidden rounded-[18px] bg-ground">
                <div className="space-y-1 bg-brand-600 px-4 py-4 text-white">
                  <div className="text-[13px] text-brand-100">আপনার গ্রুপ · সকাল ৯:০০ – ১১:৩০</div>
                  <div className="text-xl font-bold">এখন আপনার সময় চলছে</div>
                  <div className="text-sm">প্রতিটি উত্তরের খরচ সাথে সাথে দেখুন</div>
                </div>
                <div className="space-y-2.5 p-4">
                  <div className="ml-auto max-w-[82%] rounded-[16px_16px_4px_16px] bg-brand-600 px-3 py-2.5 text-[14.5px] leading-normal text-white">আমার CV-র জন্য একটা প্রফেশনাল সামারি লিখে দাও</div>
                  <div className="max-w-[90%] rounded-[16px_16px_16px_4px] border border-line bg-white px-3 py-2.5 text-[14.5px] leading-normal text-ink-2">নিশ্চয়ই! আপনার অভিজ্ঞতা আর লক্ষ্য জানালে আরও মানানসই করে দিতে পারব…</div>
                  <div className="text-xs text-mute">গ্রুপ অ্যালাওয়েন্স থেকে খরচ</div>
                </div>
                <div className="space-y-2 border-t border-line bg-white px-4 pb-4 pt-3">
                  <div className="flex flex-wrap gap-1.5 text-[12.5px]">
                    <span className="rounded-full bg-brand-600 px-2.5 py-1 font-semibold text-white">গ্রুপ অ্যালাওয়েন্স</span>
                    <span className="rounded-full border border-[#cfd8d3] px-2.5 py-1 text-ink-2">ব্যক্তিগত ওয়ালেট</span>
                  </div>
                  <div className="flex h-11 items-center rounded-xl border border-[#cfd8d3] px-3 text-sm text-mute">এখানে লিখুন…</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 space-y-6 px-5 py-12 lg:py-20">
        <div className="space-y-1.5 text-center">
          <div className="eyebrow">স্বচ্ছ দাম</div>
          <h2 className="text-2xl font-bold lg:text-4xl">কত জন, কত টাকা — আগেই দেখুন</h2>
          <p className="mx-auto max-w-2xl text-[15px] text-mute lg:text-[17px]">ব্যবহারের অংশ যায় শুধু AI-এর আসল খরচে। আমাদের আয় শুধু ছোট্ট সার্ভিস ফি।</p>
        </div>
        <Calculator pool={settings.poolAmount} fee={settings.serviceFeePerMember} schedule4={settings.schedule4} schedule5={settings.schedule5} />

        <div className="grid gap-4 pt-2 md:grid-cols-3">
          {[
            { title: "৪ জনের গ্রুপ", q: q4, hours: "প্রতিদিন ৩ ঘণ্টার নিজের সময়", featured: false },
            { title: "৫ জনের গ্রুপ", q: q5, hours: "প্রতিদিন আড়াই ঘণ্টার নিজের সময়", featured: true },
          ].map((p) => (
            <div key={p.title} className={`relative flex flex-col gap-3.5 rounded-[22px] bg-white p-6 ${p.featured ? "border-2 border-brand-600 shadow-[0_16px_40px_rgba(4,120,87,0.12)]" : "border border-line"}`}>
              {p.featured && <span className="absolute -top-3.5 left-6 rounded-full bg-brand-600 px-3 py-1 text-[13px] font-bold text-white">সবচেয়ে সাশ্রয়ী</span>}
              <h3 className="text-xl font-bold">{p.title}</h3>
              <div className="flex items-baseline gap-1.5">
                <span className={`num text-[42px] font-extrabold ${p.featured ? "text-brand-600" : ""}`}>{taka(p.q.pricePerMember)}</span>
                <span className="text-[15px] text-mute">/ জন / ৩০ দিন</span>
              </div>
              <div className="text-[15px] text-mute">{taka(p.q.sharePerMember)} ব্যবহার + {taka(p.q.feePerMember)} সার্ভিস ফি</div>
              <ul className="space-y-2 text-[15.5px]">
                {[p.hours, "আলাদা লগইন ও প্রাইভেট চ্যাট", "বাকি অ্যালাওয়েন্স লাইভ দেখুন"].map((f) => (
                  <li key={f} className="flex items-center gap-2"><IconCheck size={16} className="text-brand-600" />{f}</li>
                ))}
              </ul>
              <Link href={createHref} className={`mt-auto flex min-h-[50px] items-center justify-center rounded-[13px] text-base font-bold ${p.featured ? "bg-brand-600 text-white hover:bg-brand-700" : "border-[1.5px] border-brand-600 text-brand-900 hover:bg-brand-50"}`}>
                {p.title} খুলুন
              </Link>
            </div>
          ))}
          <div className="flex flex-col gap-3.5 rounded-[22px] bg-ink p-6 text-white">
            <h3 className="text-xl font-bold">পার্সোনাল ওয়ালেট</h3>
            <div className="flex items-baseline gap-1.5">
              <span className="num text-[42px] font-extrabold">{taka(minTopup)}</span>
              <span className="text-[15px] text-[#c9d6cf]">থেকে শুরু</span>
            </div>
            <div className="text-[15px] text-[#c9d6cf]">{settings.topupAmounts.map(taka).join(" · ")} টপ-আপ</div>
            <ul className="space-y-2 text-[15.5px]">
              {["যেকোনো সময় চ্যাট", "যতটুকু ব্যবহার ততটুকু খরচ", "মেয়াদ শেষ হয় না"].map((f) => (
                <li key={f} className="flex items-center gap-2"><IconCheck size={16} className="text-brand-100" />{f}</li>
              ))}
            </ul>
            <Link href={walletHref} className="mt-auto flex min-h-[50px] items-center justify-center rounded-[13px] bg-white text-base font-bold text-brand-900 hover:bg-brand-50">ওয়ালেটে ক্রেডিট নিন</Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 bg-white">
        <div className="mx-auto max-w-6xl space-y-6 px-5 py-12 lg:py-20">
          <h2 className="text-center text-2xl font-bold lg:text-4xl">৪ ধাপে শুরু</h2>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([t, d], i) => (
              <li key={t} className={`flex gap-3.5 rounded-[18px] p-5 lg:flex-col lg:gap-2 ${i === 3 ? "bg-brand-600 text-white" : "border border-line bg-ground"}`}>
                <span className={`num flex h-8 w-8 flex-none items-center justify-center rounded-[10px] text-[15px] font-extrabold ${i === 3 ? "bg-white/15 text-white" : "bg-mint text-brand-900"}`}>{i + 1}</span>
                <div className="space-y-1">
                  <strong className="block text-[17px]">{t}</strong>
                  <span className={`block text-[14.5px] leading-relaxed ${i === 3 ? "text-brand-50" : "text-mute"}`}>{d}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Why */}
      <section className="mx-auto max-w-6xl space-y-6 px-5 py-12 lg:py-20">
        <h2 className="text-center text-2xl font-bold lg:text-4xl">কেন Pala AI</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {WHY.map(([Icon, t, d]) => (
            <div key={t} className="space-y-1.5 rounded-2xl border border-line bg-white p-4 lg:p-6">
              <Icon size={24} className="text-brand-600" />
              <strong className="block text-[15.5px] lg:text-lg">{t}</strong>
              <span className="block text-[13.5px] leading-relaxed text-mute lg:text-[15px]">{d}</span>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 bg-white">
        <div className="mx-auto max-w-3xl space-y-3 px-5 py-12 lg:py-20">
          <h2 className="pb-2 text-center text-2xl font-bold lg:text-4xl">সাধারণ প্রশ্ন</h2>
          {FAQ.map(([qn, a], i) => (
            <details key={qn} open={i === 0} className="group rounded-2xl border border-line bg-white px-5 py-4">
              <summary className="cursor-pointer list-none text-base font-semibold lg:text-lg">
                <span className="flex items-center justify-between gap-3">{qn}<span className="text-brand-600 transition group-open:rotate-45" aria-hidden>+</span></span>
              </summary>
              <p className="mt-2 text-[15px] leading-relaxed text-mute">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-col items-start gap-4 rounded-[24px] bg-brand-600 p-7 text-white lg:flex-row lg:items-center lg:justify-between lg:p-10">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold lg:text-3xl">আজই বন্ধুদের নিয়ে শুরু করুন</h2>
            <p className="text-brand-50">গ্রুপ খুলতে এক মিনিট লাগে। সবাই পেমেন্ট না করা পর্যন্ত কিছুই চালু হয় না।</p>
          </div>
          <Link href={user ? "/dashboard" : "/signup"} className="flex min-h-[52px] items-center justify-center rounded-[14px] bg-white px-7 text-[17px] font-bold text-brand-900 hover:bg-brand-50">
            {user ? "আমার ড্যাশবোর্ড" : "ফ্রি অ্যাকাউন্ট খুলুন"}
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
