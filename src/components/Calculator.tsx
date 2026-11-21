"use client";
import { useState } from "react";
import type { Slot } from "@/lib/slots";
import { formatSlot } from "@/lib/slots";
import { taka } from "@/lib/money";

const COLORS = ["#047857", "#0e7490", "#b45309", "#6d28d9", "#be185d"];

function useCalc(pool: number, fee: number, seats: number) {
  const share = Math.round(pool / seats);
  return { share, each: share + fee, total: (share + fee) * seats };
}

function SeatToggle({ seats, setSeats }: { seats: 4 | 5; setSeats: (n: 4 | 5) => void }) {
  return (
    <div role="radiogroup" aria-label="সদস্য সংখ্যা" className="grid grid-cols-2 gap-1.5 rounded-[13px] bg-[#eef2ef] p-1.5">
      {([4, 5] as const).map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={seats === n}
          onClick={() => setSeats(n)}
          className={`min-h-11 rounded-[10px] px-5 text-base ${seats === n ? "bg-white font-bold text-brand-900 shadow-[0_1px_3px_rgba(16,35,28,0.12)]" : "font-semibold text-mute"}`}
        >
          {n === 4 ? "৪ জন" : "৫ জন"}
        </button>
      ))}
    </div>
  );
}

/** Live 4-vs-5 price calculator with the daily slot schedule. */
export function Calculator({ pool, fee, schedule4, schedule5 }: { pool: number; fee: number; schedule4: Slot[]; schedule5: Slot[] }) {
  const [seats, setSeats] = useState<4 | 5>(4);
  const c = useCalc(pool, fee, seats);
  const schedule = seats === 4 ? schedule4 : schedule5;
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="calculator">
      <div className="card space-y-4 p-5">
        <SeatToggle seats={seats} setSeats={setSeats} />
        <dl className="space-y-2.5 text-[15.5px]">
          <div className="flex justify-between gap-3"><dt className="text-mute">মাসিক API ব্যবহার বাজেট (নমুনা)</dt><dd className="num font-semibold">{taka(pool)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-mute">প্রতিজনের ব্যবহারের অংশ</dt><dd className="num font-semibold">{taka(c.share)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-mute">সার্ভিস ফি</dt><dd className="num font-semibold">+ {taka(fee)}</dd></div>
        </dl>
        <div className="flex items-end justify-between border-t border-line pt-3">
          <span className="text-base font-semibold">প্রতিজন দেবেন / ৩০ দিন</span>
          <span className="num text-[34px] font-extrabold leading-none text-brand-600" data-testid="per-person">{taka(c.each)}</span>
        </div>
        <p className="text-[13px] leading-relaxed text-mute">
          পুরো গ্রুপ মিলে {taka(c.total)}। ব্যবহারের অংশ দিয়ে শুধু Anthropic-এর আসল টোকেন খরচ মেটানো হয় — নির্দিষ্ট পরিমাণ ব্যবহারের নিশ্চয়তা নয়। দাম ওই মাসের জন্য লক থাকে।
        </p>
      </div>
      <div className="card space-y-3 p-5" id="slots">
        <h3 className="text-lg font-bold">প্রতিদিন প্রত্যেকের নিজের সময়</h3>
        <p className="text-sm text-mute">বাংলাদেশ সময়। পেমেন্টের আগেই সময় বেছে নেবেন।</p>
        <ul className="space-y-2">
          {schedule.map((s, i) => (
            <li key={`${seats}-${i}`} className="flex items-center gap-3 rounded-xl border border-line bg-ground px-3.5 py-2.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: COLORS[i] }} aria-hidden />
              <span className="text-[15px] font-medium">{formatSlot(s)}</span>
            </li>
          ))}
        </ul>
        <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full" aria-hidden>
          {schedule.map((_, i) => <span key={i} className="flex-1" style={{ background: COLORS[i] }} />)}
        </div>
      </div>
    </div>
  );
}
