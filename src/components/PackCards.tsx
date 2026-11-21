import Link from "next/link";
import type { AppSettings } from "@/lib/settings";
import { topupBonus } from "@/lib/packs";
import { taka, bnNum } from "@/lib/money";
import { approxMessages } from "@/lib/estimates";
import { IconCheck } from "./Icons";

/** Bonus packs. `firstTopup` = this visitor would get the first-top-up bonus (logged out or no approved top-up yet). */
export function PackCards({ settings, firstTopup, loggedIn }: { settings: AppSettings; firstTopup: boolean; loggedIn: boolean }) {
  const popular = settings.packs.length > 2 ? settings.packs[2].amount : settings.packs[settings.packs.length - 1].amount;
  return (
    <div className="space-y-4">
      {firstTopup && settings.firstTopupBonusPercent > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-center text-[15px] text-amber-900 ring-1 ring-amber-200" data-testid="first-bonus">
          <strong>প্রথম টপ-আপে +{bnNum(settings.firstTopupBonusPercent)}% বোনাস</strong>
          <span>(সর্বোচ্চ {taka(settings.firstTopupBonusCap)}) — প্যাকের বোনাসের চেয়ে বেশি হলে এটাই পাবেন।</span>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {settings.packs.map((p) => {
          const { bonus, kind } = topupBonus(p.amount, p, firstTopup, settings);
          const credits = p.amount + bonus;
          const featured = p.amount === popular;
          const href = loggedIn ? `/pay?purpose=WALLET_TOPUP&amount=${p.amount}` : `/signup?next=${encodeURIComponent(`/pay?purpose=WALLET_TOPUP&amount=${p.amount}`)}`;
          const fill = Math.round((credits / (settings.packs[settings.packs.length - 1].amount * 1.2)) * 100);
          return (
            <div key={p.amount} className={`relative flex flex-col gap-3 rounded-[22px] bg-white p-5 ${featured ? "border-2 border-brand-600 shadow-[0_16px_40px_rgba(4,120,87,0.12)]" : "border border-line"}`} data-testid={`pack-${p.amount / 100}`}>
              {featured && <span className="absolute -top-3.5 left-5 rounded-full bg-brand-600 px-3 py-1 text-[13px] font-bold text-white">সবচেয়ে জনপ্রিয়</span>}
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-bold">{p.name}</span>
                {bonus > 0 && (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${kind === "FIRST" ? "bg-amber-100 text-amber-900" : "bg-mint text-brand-900"}`}>
                    +{taka(bonus)} বোনাস
                  </span>
                )}
              </div>
              <div>
                <span className={`num text-[38px] font-extrabold leading-none ${featured ? "text-brand-600" : ""}`}>{taka(p.amount)}</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[13.5px]">
                  <span className="text-mute">ব্যালান্স পাবেন</span>
                  <strong className="num">{taka(credits)}</strong>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#eef2ef]"><div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, fill)}%` }} /></div>
                <div className="text-[13px] text-mute">প্রায় <strong className="text-ink">{bnNum(approxMessages(settings, credits))}টি</strong> সাধারণ মেসেজ*</div>
              </div>
              <ul className="space-y-1.5 text-[14.5px]">
                {["মেয়াদ নেই", "দৈনিক লিমিট নেই", "প্রতি উত্তরের খরচ দেখা যায়"].map((f) => (
                  <li key={f} className="flex items-center gap-2"><IconCheck size={15} className="text-brand-600" />{f}</li>
                ))}
              </ul>
              <Link href={href} className={`mt-auto flex min-h-[48px] items-center justify-center rounded-[13px] text-base font-bold ${featured ? "bg-brand-600 text-white hover:bg-brand-700" : "border-[1.5px] border-brand-600 text-brand-900 hover:bg-brand-50"}`}>
                {taka(p.amount)} কিনুন
              </Link>
            </div>
          );
        })}
      </div>
      <p className="text-center text-[12.5px] text-mute">*বাংলায় চলমান চ্যাটের হিসাবে (রক্ষণশীল অনুমান)। ছোট প্রশ্নে এর চেয়ে বেশি মেসেজ পাবেন। ৳১ ব্যালান্স = ১ ক্রেডিট।</p>
    </div>
  );
}
