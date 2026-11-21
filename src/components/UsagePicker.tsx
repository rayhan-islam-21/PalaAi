"use client";
import { useState } from "react";
import { taka, bnNum } from "@/lib/money";

type PackInfo = { amount: number; credits: number; name: string };

const LEVELS = [
  { key: "light", label: "হালকা", hint: "দিনে ~৫টি প্রশ্ন", perDay: 5 },
  { key: "regular", label: "নিয়মিত", hint: "দিনে ~১৫টি", perDay: 15 },
  { key: "heavy", label: "বেশি", hint: "দিনে ~৪০টি", perDay: 40 },
  { key: "pro", label: "সারাদিন", hint: "দিনে ~১০০টি", perDay: 100 },
];

/** Recommends a pack from how many messages a day someone sends. */
export function UsagePicker({ packs, perMessage }: { packs: PackInfo[]; perMessage: number }) {
  const [level, setLevel] = useState(1);
  const l = LEVELS[level];
  const monthly = l.perDay * 30 * perMessage;
  const pick = packs.find((p) => p.credits >= monthly) ?? packs[packs.length - 1];
  const days = Math.max(1, Math.floor(pick.credits / (l.perDay * perMessage)));
  return (
    <div className="card mx-auto max-w-2xl space-y-4 p-5" data-testid="usage-picker">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">আপনি কতটা AI ব্যবহার করেন?</h3>
        <span className="text-xs text-mute">একটি বাছুন</span>
      </div>
      <div role="radiogroup" aria-label="ব্যবহারের মাত্রা" className="grid grid-cols-4 gap-2">
        {LEVELS.map((x, i) => (
          <button
            key={x.key}
            type="button"
            role="radio"
            aria-checked={i === level}
            onClick={() => setLevel(i)}
            className={`rounded-xl px-2 py-2.5 text-center ${i === level ? "bg-brand-600 text-white" : "bg-ground text-ink-2 ring-1 ring-line"}`}
          >
            <div className="h-1.5 rounded-full" style={{ background: i <= level ? (i === level ? "#fff" : "#047857") : "#dfe6e2" }} />
            <div className="mt-2 text-[14.5px] font-bold">{x.label}</div>
            <div className={`text-[11.5px] ${i === level ? "text-brand-50" : "text-mute"}`}>{x.hint}</div>
          </button>
        ))}
      </div>
      <div className="rounded-xl bg-mint p-4 text-[15px] text-brand-900">
        আপনার জন্য <strong>{pick.name} ({taka(pick.amount)})</strong> — {taka(pick.credits)} ব্যালান্সে এই হারে প্রায় <strong>{bnNum(days)} দিন</strong> চলবে।
        <span className="mt-1 block text-[13px] text-brand-900/80">মাসিক খরচ আনুমানিক {taka(Math.round(monthly / 100) * 100)} — যেটুকু ব্যবহার করবেন শুধু সেটুকুই কাটবে।</span>
      </div>
    </div>
  );
}
