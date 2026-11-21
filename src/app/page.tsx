import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { IconChart, IconCheck, IconClock, IconLang, IconLock, IconPhone, IconRefund, IconShield, IconWallet, IconChat } from "@/components/Icons";
import { takaPrecise, taka, bnNum } from "@/lib/money";
import { approxMessages, exampleCharges } from "@/lib/estimates";

export const dynamic = "force-dynamic";

const STEPS = [
  ["ফ্রি অ্যাকাউন্ট খুলুন", "ইমেইল আর পাসওয়ার্ড দিয়ে এক মিনিটে।"],
  ["ক্রেডিট কিনুন", "বিকাশ/নগদে টাকা পাঠিয়ে TrxID জমা দিন।"],
  ["যাচাইয়ের পর ব্যালান্স যোগ", "আমরা স্টেটমেন্ট মিলিয়ে অনুমোদন দিলেই ব্যালান্স চালু।"],
  ["যখন খুশি চ্যাট করুন", "প্রতিটি উত্তরের খরচ আর বাকি ব্যালান্স সাথে সাথে দেখুন।"],
];

const WHY = [
  [IconClock, "লিমিটের অপেক্ষা নেই", "ব্যালান্স থাকলে যখন খুশি ব্যবহার করুন।"],
  [IconChart, "যতটুকু ব্যবহার, ততটুকু খরচ", "ছোট প্রশ্নে কম, লম্বা লেখায় বেশি — আসল হিসাবে।"],
  [IconRefund, "ব্যর্থ হলে টাকা কাটে না", "AI উত্তর দিতে না পারলে আপনার ব্যালান্স ফেরত যায়।"],
  [IconLock, "প্রাইভেট চ্যাট", "আপনার চ্যাট শুধু আপনিই দেখতে পান।"],
  [IconShield, "পাসওয়ার্ড শেয়ার নয়", "নিজের অ্যাকাউন্ট, অফিসিয়াল API।"],
  [IconLang, "বাংলায় সহজ", "বাংলা, ইংরেজি বা বাংলিশে প্রশ্ন করুন।"],
] as const;

const FAQ = [
  ["এটা কি Claude Pro সাবস্ক্রিপশন?", "না। Pala AI আমাদের নিজস্ব চ্যাট অ্যাপ, Anthropic-এর অফিসিয়াল API দিয়ে Claude মডেল চালায়। claude.ai, Claude Code বা Pro ফিচারের অ্যাক্সেস দেয় না, আর কোনো অ্যাকাউন্ট বা পাসওয়ার্ড শেয়ার করা হয় না।"],
  ["প্রতি মেসেজে কত টাকা কাটে?", "যতটুকু লেখা AI পড়ে ও লেখে (টোকেন), সেই হিসাবে। ছোট প্রশ্নে কয়েক পয়সা থেকে ১ টাকা, লম্বা লেখা বা কোডে কয়েক টাকা। প্রতিটি উত্তরের নিচে ঠিক কত কাটল আর কত বাকি তা দেখানো হয়।"],
  ["ব্যালান্স কি মেয়াদ শেষে বাতিল হয়?", "না, ওয়ালেটের ব্যালান্সের কোনো মেয়াদ নেই।"],
  ["পেমেন্ট কীভাবে যাচাই হয়?", "আপনি বিকাশ/নগদে টাকা পাঠিয়ে ট্রানজ্যাকশন আইডি জমা দেন। আমরা আমাদের স্টেটমেন্টের সাথে মিলিয়ে অনুমোদন দিই। অবস্থা আপনার পেমেন্ট পেজে দেখা যায়।"],
  ["কীভাবে কম খরচে বেশি ব্যবহার করব?", "নতুন বিষয়ে নতুন চ্যাট শুরু করুন — পুরোনো লম্বা চ্যাটে প্রতিবার আগের সব লেখাও AI-কে আবার পড়তে হয়, তাই খরচ বাড়ে।"],
];

export default async function Home() {
  const [settings, user] = await Promise.all([getSettings(prisma), getUser()]);
  const examples = exampleCharges(settings);
  const minTopup = Math.min(...settings.topupAmounts);
  const buyHref = user ? "/wallet" : "/signup?next=/wallet";

  return (
    <AppShell bare footer>
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-12 pt-8 lg:grid-cols-[1.25fr_1fr] lg:gap-12 lg:pb-20 lg:pt-16">
          <div className="space-y-5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-mint px-3 py-1.5 text-[13px] font-semibold text-brand-900">
              <IconCheck size={14} className="text-brand-600" /> অফিসিয়াল Anthropic API দিয়ে চালিত
            </span>
            <h1 className="text-[31px] font-bold leading-[1.25] sm:text-[44px] lg:text-[52px] lg:leading-[1.18]">
              Claude AI ব্যবহার করুন — <span className="text-brand-600">লিমিটের অপেক্ষা ছাড়া, বিকাশে পেমেন্ট</span>
            </h1>
            <p className="max-w-xl text-[16.5px] leading-relaxed text-[#42524b] lg:text-[19px]">
              {taka(minTopup)} থেকে ক্রেডিট কিনুন, যতটুকু ব্যবহার ততটুকু খরচ। প্রতিটি উত্তরের খরচ আর বাকি ব্যালান্স সবসময় চোখের সামনে।
            </p>
            <div className="grid gap-2.5 sm:flex sm:flex-wrap">
              <Link href={buyHref} className="flex min-h-[54px] items-center justify-center gap-2 rounded-[14px] bg-brand-600 px-6 text-[17px] font-bold text-white hover:bg-brand-700">
                <IconWallet size={20} /> ক্রেডিট কিনুন
              </Link>
              <Link href={user ? "/chat" : "/signup?next=/chat"} className="flex min-h-[54px] items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-brand-600 bg-white px-6 text-[17px] font-bold text-brand-900 hover:bg-brand-50">
                <IconChat size={20} /> চ্যাট শুরু করুন
              </Link>
            </div>
            <ul className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-5">
              {[[IconPhone, "বিকাশ ও নগদে পেমেন্ট"], [IconLock, "আপনার প্রাইভেট চ্যাট"], [IconRefund, "ব্যর্থ হলে টাকা কাটে না"]].map(([I, t]) => {
                const Ic = I as typeof IconPhone;
                return (
                  <li key={t as string} className="flex flex-col items-center gap-1 rounded-xl bg-ground px-1 py-2.5 text-center text-[12.5px] leading-snug text-ink-2 sm:flex-row sm:bg-transparent sm:p-0 sm:text-[15px]">
                    <Ic size={19} className="text-brand-600" /> {t as string}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="hidden justify-center lg:flex" aria-hidden>
            <div className="w-full max-w-[400px] rounded-[28px] bg-ink p-3.5 shadow-[0_24px_60px_rgba(16,35,28,0.18)]">
              <div className="overflow-hidden rounded-[18px] bg-ground">
                <div className="space-y-1 bg-brand-600 px-4 py-4 text-white">
                  <div className="text-[13px] text-brand-100">আমার ওয়ালেট</div>
                  <div className="num text-3xl font-extrabold">{taka(25000)}</div>
                  <div className="text-sm">প্রতিটি উত্তরের খরচ সাথে সাথে দেখুন</div>
                </div>
                <div className="space-y-2.5 p-4">
                  <div className="ml-auto max-w-[82%] rounded-[16px_16px_4px_16px] bg-brand-600 px-3 py-2.5 text-[14.5px] leading-normal text-white">আমার জন্য একটা ছুটির দরখাস্ত লিখে দাও</div>
                  <div className="max-w-[90%] rounded-[16px_16px_16px_4px] border border-line bg-white px-3 py-2.5 text-[14.5px] leading-normal text-ink-2">বরাবর, প্রধান শিক্ষক… বিষয়: ছুটির আবেদন…</div>
                  <div className="text-xs text-mute">ব্যক্তিগত ওয়ালেট · খরচ {takaPrecise(examples[1].charge)}</div>
                </div>
                <div className="border-t border-line bg-white px-4 pb-4 pt-3">
                  <div className="flex h-11 items-center rounded-xl border border-[#cfd8d3] px-3 text-sm text-mute">এখানে লিখুন…</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 space-y-6 px-5 py-12 lg:py-20">
        <div className="space-y-1.5 text-center">
          <div className="eyebrow">স্বচ্ছ দাম</div>
          <h2 className="text-2xl font-bold lg:text-4xl">যতটুকু ব্যবহার, ততটুকু খরচ</h2>
          <p className="mx-auto max-w-2xl text-[15px] text-mute lg:text-[17px]">কোনো মাসিক চার্জ নেই, ব্যালান্সের মেয়াদ নেই। প্রতিটি উত্তরে AI যতটুকু লেখা পড়ে ও লেখে, সেই হিসাবে কাটা হয়।</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {settings.topupAmounts.map((a, i) => (
            <div key={a} className={`relative flex flex-col gap-3 rounded-[22px] bg-white p-6 ${i === 1 ? "border-2 border-brand-600 shadow-[0_16px_40px_rgba(4,120,87,0.12)]" : "border border-line"}`}>
              {i === 1 && <span className="absolute -top-3.5 left-6 rounded-full bg-brand-600 px-3 py-1 text-[13px] font-bold text-white">সবচেয়ে জনপ্রিয়</span>}
              <div className={`num text-[42px] font-extrabold ${i === 1 ? "text-brand-600" : ""}`}>{taka(a)}</div>
              <div className="text-[15px] text-mute">প্রায় <strong className="text-ink">{bnNum(approxMessages(settings, a))}টি</strong> সাধারণ মেসেজ*</div>
              <ul className="space-y-2 text-[15.5px]">
                {["মেয়াদ শেষ হয় না", "যখন খুশি ব্যবহার", "প্রতি উত্তরের খরচ দেখা যায়"].map((f) => (
                  <li key={f} className="flex items-center gap-2"><IconCheck size={16} className="text-brand-600" />{f}</li>
                ))}
              </ul>
              <Link href={user ? `/pay?purpose=WALLET_TOPUP&amount=${a}` : "/signup?next=/wallet"} className={`mt-auto flex min-h-[50px] items-center justify-center rounded-[13px] text-base font-bold ${i === 1 ? "bg-brand-600 text-white hover:bg-brand-700" : "border-[1.5px] border-brand-600 text-brand-900 hover:bg-brand-50"}`}>
                {taka(a)} কিনুন
              </Link>
            </div>
          ))}
        </div>

        <div className="card space-y-3 p-5">
          <h3 className="text-lg font-bold">কোন কাজে কত খরচ হয় (আনুমানিক)</h3>
          <ul className="divide-y divide-line">
            {examples.map((e) => (
              <li key={e.key} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <div className="font-semibold">{e.label}</div>
                  <div className="text-[13px] text-mute">{e.hint}</div>
                </div>
                <div className="num shrink-0 text-lg font-bold text-brand-700">≈ {takaPrecise(e.charge)}</div>
              </li>
            ))}
          </ul>
          <p className="text-[13px] leading-relaxed text-mute">
            *বাংলায় লেখা উত্তরে ইংরেজির চেয়ে বেশি খরচ হয়, আর লম্বা চ্যাটে প্রতিবার আগের লেখাও পড়তে হয়। আসল খরচ প্রতিটি উত্তরের নিচে দেখানো হয়।
          </p>
        </div>
      </section>

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

      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-col items-start gap-4 rounded-[24px] bg-brand-600 p-7 text-white lg:flex-row lg:items-center lg:justify-between lg:p-10">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold lg:text-3xl">আজই শুরু করুন</h2>
            <p className="text-brand-50">অ্যাকাউন্ট খুলতে এক মিনিট লাগে। {taka(minTopup)} দিয়েই শুরু।</p>
          </div>
          <Link href={user ? "/dashboard" : "/signup"} className="flex min-h-[52px] items-center justify-center rounded-[14px] bg-white px-7 text-[17px] font-bold text-brand-900 hover:bg-brand-50">
            {user ? "আমার ড্যাশবোর্ড" : "ফ্রি অ্যাকাউন্ট খুলুন"}
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
