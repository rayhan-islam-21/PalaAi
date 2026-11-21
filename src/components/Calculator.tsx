"use client";
import { useState } from "react";
import type { Slot } from "@/lib/slots";
import { formatSlot } from "@/lib/slots";
import { taka } from "@/lib/money";

export function Calculator({
  pool,
  fee,
  schedule4,
  schedule5,
}: {
  pool: number;
  fee: number;
  schedule4: Slot[];
  schedule5: Slot[];
}) {
  const [seats, setSeats] = useState<4 | 5>(4);
  const calc = (n: number) => {
    const share = Math.round(pool / n);
    return { share, each: share + fee, total: (share + fee) * n };
  };
  const c = calc(seats);
  const schedule = seats === 4 ? schedule4 : schedule5;
  return (
    <div className="card" data-testid="calculator">
      <div className="flex items-center justify-between gap-3">
        <h2 className="h2">খরচের হিসাব</h2>
        <div role="radiogroup" aria-label="সদস্য সংখ্যা" className="flex rounded-xl bg-gray-100 p-1">
          {[4, 5].map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={seats === n}
              onClick={() => setSeats(n as 4 | 5)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${seats === n ? "bg-white shadow text-brand-700" : "text-gray-600"}`}
            >
              {n === 4 ? "৪ জন" : "৫ জন"}
            </button>
          ))}
        </div>
      </div>
      <dl className="mt-4 space-y-2 text-[15px]">
        <div className="flex justify-between"><dt className="text-gray-600">মাসিক API ব্যবহার বাজেট (নমুনা)</dt><dd>{taka(pool)}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-600">প্রতিজনের ব্যবহারের অংশ</dt><dd>{taka(c.share)}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-600">সার্ভিস ফি (প্রতিজন)</dt><dd>+ {taka(fee)}</dd></div>
        <div className="flex justify-between border-t pt-2 text-lg font-bold">
          <dt>প্রতিজন দেবেন</dt>
          <dd className="text-brand-700" data-testid="per-person">{taka(c.each)}</dd>
        </div>
        <div className="flex justify-between text-sm text-gray-500"><dt>পুরো গ্রুপ মিলে</dt><dd>{taka(c.total)}</dd></div>
      </dl>
      <div className="mt-4 grid grid-cols-2 gap-2 text-center text-sm">
        {[4, 5].map((n) => (
          <div key={n} className={`rounded-xl p-2 ${n === seats ? "bg-brand-50 ring-1 ring-brand-500/40" : "bg-gray-50"}`}>
            <div className="text-gray-600">{n === 4 ? "৪ জন" : "৫ জন"}</div>
            <div className="font-bold">{taka(calc(n).share)} + {taka(fee)} = {taka(calc(n).each)}</div>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <div className="text-sm font-semibold text-gray-700">প্রতিদিন প্রত্যেকের জন্য আলাদা সময় (বাংলাদেশ সময়):</div>
        <ul className="mt-1 grid grid-cols-1 gap-1 text-sm text-gray-600 sm:grid-cols-2">
          {schedule.map((s, i) => <li key={i}>• {formatSlot(s)}</li>)}
        </ul>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        ব্যবহারের অংশ দিয়ে Anthropic API-এর আসল খরচ মেটানো হয় — প্রতিটি উত্তরের খরচ টোকেন হিসেবে আপনার অংশ থেকে কাটা হয়। বাজেট একটি নমুনা; নির্দিষ্ট পরিমাণ ব্যবহারের নিশ্চয়তা নয়।
      </p>
    </div>
  );
}
