"use client";
import { useActionState, useState } from "react";
import type { Slot } from "@/lib/slots";
import { formatSlot } from "@/lib/slots";
import { taka } from "@/lib/money";
import type { FormAction } from "./ActionForm";

export function GroupCreateForm({
  action, pool, fee, schedule4, schedule5,
}: { action: FormAction; pool: number; fee: number; schedule4: Slot[]; schedule5: Slot[] }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [seats, setSeats] = useState<4 | 5>(4);
  const schedule = seats === 4 ? schedule4 : schedule5;
  const share = Math.round(pool / seats);
  return (
    <form action={formAction} className="space-y-4">
      <div className="card space-y-3">
        <div>
          <label className="label" htmlFor="name">গ্রুপের নাম</label>
          <input className="input" id="name" name="name" placeholder="যেমন: ভার্সিটি বন্ধুরা" maxLength={60} required />
        </div>
        <fieldset>
          <legend className="label">কতজনের গ্রুপ?</legend>
          <div className="grid grid-cols-2 gap-2">
            {[4, 5].map((n) => (
              <label key={n} className={`cursor-pointer rounded-xl border p-3 text-center ${seats === n ? "border-brand-600 bg-brand-50" : "border-gray-200"}`}>
                <input type="radio" name="seats" value={n} className="sr-only" checked={seats === n} onChange={() => setSeats(n as 4 | 5)} />
                <div className="font-bold">{n === 4 ? "৪ জন" : "৫ জন"}</div>
                <div className="text-sm text-gray-600">প্রতিজন {taka(Math.round(pool / n) + fee)}</div>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="card">
        <div className="label">আপনার দৈনিক সময় বেছে নিন (বাংলাদেশ সময়)</div>
        <div className="space-y-2">
          {schedule.map((s, i) => (
            <label key={`${seats}-${i}`} className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 p-3 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
              <input type="radio" name="slotIndex" value={i} required defaultChecked={i === 0} className="h-5 w-5 accent-brand-600" />
              <span>{formatSlot(s)}</span>
            </label>
          ))}
        </div>
        <p className="muted mt-2">বাকি সময়গুলো বন্ধুরা যোগ দেওয়ার সময় বেছে নেবেন।</p>
      </div>
      <div className="card text-[15px]">
        <div className="flex justify-between"><span>ব্যবহারের অংশ</span><span>{taka(share)}</span></div>
        <div className="flex justify-between"><span>সার্ভিস ফি</span><span>+ {taka(fee)}</span></div>
        <div className="mt-1 flex justify-between border-t pt-1 text-lg font-bold"><span>আপনার অংশ</span><span className="text-brand-700">{taka(share + fee)}</span></div>
        <p className="muted mt-1">এই দাম এই মাসের জন্য লক থাকবে। সবাই যোগ দিয়ে পেমেন্ট যাচাই হলে ৩০ দিনের পাস চালু হবে।</p>
      </div>
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button className="btn-primary w-full py-3.5 text-lg" disabled={pending}>{pending ? "অপেক্ষা করুন…" : "গ্রুপ তৈরি করুন"}</button>
    </form>
  );
}
