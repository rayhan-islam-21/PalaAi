"use client";
import { useActionState, useState } from "react";
import type { FormAction } from "./ActionForm";
import { CopyButton } from "./CopyButton";

type Method = { provider: string; label: string; receiverNumber: string; accountType: string; instructions: string; isDemo: boolean };

export function PayForm({ action, methods, amountLabel, hidden }: { action: FormAction; methods: Method[]; amountLabel: string; hidden: Record<string, string> }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [provider, setProvider] = useState(methods[0].provider);
  const m = methods.find((x) => x.provider === provider)!;
  return (
    <form action={formAction} className="space-y-4">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input type="hidden" name="provider" value={provider} />
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="পেমেন্ট মাধ্যম">
        {methods.map((x) => (
          <button type="button" role="radio" aria-checked={provider === x.provider} key={x.provider} onClick={() => setProvider(x.provider)}
            className={`rounded-xl border p-3 font-bold ${provider === x.provider ? (x.provider === "BKASH" ? "border-pink-600 bg-pink-50 text-pink-700" : "border-orange-500 bg-orange-50 text-orange-700") : "border-gray-200 bg-white"}`}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="card space-y-2">
        <div className="text-sm text-gray-600">ধাপ ১: নিচের নম্বরে <strong>{amountLabel}</strong> “Send Money”{m.accountType === "Merchant" ? " / Payment" : ""} করুন</div>
        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
          <div>
            <div className="font-mono text-xl font-bold" data-testid="receiver-number">{m.receiverNumber}</div>
            <div className="text-xs text-gray-500">{m.label} {m.accountType}{m.isDemo ? " · ডেমো নম্বর — টাকা পাঠাবেন না" : ""}</div>
          </div>
          <CopyButton text={m.receiverNumber} />
        </div>
        {m.instructions && <p className="whitespace-pre-line text-sm text-gray-700">{m.instructions}</p>}
      </div>
      <div className="card space-y-3">
        <div className="text-sm text-gray-600">ধাপ ২: পেমেন্টের তথ্য দিন</div>
        <div>
          <label className="label" htmlFor="senderNumber">যে নম্বর থেকে পাঠিয়েছেন</label>
          <input className="input" id="senderNumber" name="senderNumber" inputMode="tel" placeholder="01XXXXXXXXX" required autoComplete="tel" />
        </div>
        <div>
          <label className="label" htmlFor="transactionId">ট্রানজ্যাকশন আইডি (TrxID)</label>
          <input className="input font-mono uppercase" id="transactionId" name="transactionId" placeholder="যেমন: 9A7B6C5D4E" required autoComplete="off" autoCapitalize="characters" />
          <p className="mt-1 text-xs text-gray-500">মেসেজে পাওয়া TrxID হুবহু লিখুন। আমরা আমাদের স্টেটমেন্টের সাথে মিলিয়ে অনুমোদন দেব।</p>
        </div>
      </div>
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button className="btn-primary w-full py-3.5 text-lg" disabled={pending}>{pending ? "জমা হচ্ছে…" : "পেমেন্ট জমা দিন"}</button>
    </form>
  );
}
