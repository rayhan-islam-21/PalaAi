"use client";
import Link from "next/link";
import { useState } from "react";
import { taka, bnNum } from "@/lib/money";

export type PackView = { amount: number; name: string; credits: number; bonus: number; messages: number };

/** Compact pack chooser: tap a tile, one buy button. */
export function PackPicker({ packs, loggedIn, defaultIndex }: { packs: PackView[]; loggedIn: boolean; defaultIndex: number }) {
  const [i, setI] = useState(Math.min(defaultIndex, packs.length - 1));
  const p = packs[i];
  const target = `/pay?purpose=WALLET_TOPUP&amount=${p.amount}`;
  const href = loggedIn ? target : `/signup?next=${encodeURIComponent(target)}`;
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="প্যাক বাছুন" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {packs.map((x, j) => {
          const on = j === i;
          return (
            <button
              key={x.amount}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setI(j)}
              data-testid={`pack-${x.amount / 100}`}
              className={`relative rounded-2xl bg-white p-4 text-left transition ${on ? "ring-2 ring-brand-600" : "ring-1 ring-line hover:ring-brand-600/40"}`}
            >
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-semibold text-mute">{x.name}</span>
                {x.bonus > 0 && <span className="font-semibold text-brand-700">+{taka(x.bonus)}</span>}
              </div>
              <div className="num mt-1 text-[28px] font-extrabold leading-tight">{taka(x.amount)}</div>
              <div className="mt-1 text-[13px] text-mute">প্রায় {bnNum(x.messages)}টি মেসেজ</div>
              {on && <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-brand-600" aria-hidden />}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col items-stretch gap-3 rounded-2xl bg-white p-4 ring-1 ring-line sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[15px]">
          <span className="text-mute">ব্যালান্স পাবেন </span>
          <strong className="num text-lg">{taka(p.credits)}</strong>
          {p.bonus > 0 && <span className="text-mute"> (বোনাস সহ)</span>}
        </div>
        <Link href={href} className="btn-primary min-h-12 px-8 text-[17px]" data-testid="buy-pack">
          {taka(p.amount)} কিনুন
        </Link>
      </div>
    </div>
  );
}
