"use client";
import { useActionState, useState } from "react";
import type { FormAction } from "@/components/ActionForm";
import type { ModelPrice } from "@/lib/models";

type Initial = {
  modelId: string;
  input: number;
  output: number;
  usdToBdt: number;
  markup: number;
  packs: { amount: number; bonusPercent: number; name: string }[];
  firstBonusPercent: number;
  firstBonusCap: number;
  maxOutputTokens: number;
  minOutputTokens: number;
  effort: string;
};

/** A typical Bangla message: ~3,000 input + 700 output tokens. */
const TYP_IN = 3000;
const TYP_OUT = 700;

export function BusinessSettings({ action, models, initial }: { action: FormAction; models: ModelPrice[]; initial: Initial }) {
  const [state, formAction, pending] = useActionState(action, null);
  const knownId = models.some((m) => m.id === initial.modelId) ? initial.modelId : "custom";
  const [model, setModel] = useState(knownId);
  const [rate, setRate] = useState(String(initial.usdToBdt));
  const [markup, setMarkup] = useState(String(initial.markup));
  const [cin, setCin] = useState(String(initial.input));
  const [cout, setCout] = useState(String(initial.output));
  const [packs, setPacks] = useState(initial.packs.map((p) => ({ name: p.name, amount: String(p.amount / 100), bonus: String(p.bonusPercent) })));
  const [firstPct, setFirstPct] = useState(String(initial.firstBonusPercent));
  const [firstCap, setFirstCap] = useState(String(initial.firstBonusCap / 100));
  const packMargin = (amountTk: number, bonusTk: number) => {
    const cost = ((amountTk + bonusTk) * 100) / (100 + (Number(markup) || 0));
    return ((amountTk - cost - amountTk * 0.015) / amountTk) * 100;
  };

  const m = models.find((x) => x.id === model);
  const inP = m ? m.input : Number(cin) || 0;
  const outP = m ? m.output : Number(cout) || 0;
  const r = Number(rate) || 0;
  const mk = Number(markup) || 0;
  const cost = ((TYP_IN * inP + TYP_OUT * outP) / 1e6) * r;
  const price = cost * (1 + mk / 100);
  const margin = mk > 0 ? (mk / (100 + mk)) * 100 : 0;

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="model">AI model</label>
          <select id="model" name="model" className="input" value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((x) => (
              <option key={x.id} value={x.id}>{x.label} — ${x.input} in / ${x.output} out</option>
            ))}
            <option value="custom">Other (custom)…</option>
          </select>
          <p className="mt-1 text-xs text-mute">Sonnet 5.5 is recommended: half the cost of Opus, good for most chats.</p>
        </div>
        <div>
          <label className="label" htmlFor="usdToBdt">Dollar rate (৳ per $1)</label>
          <input id="usdToBdt" name="usdToBdt" className="input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} required />
          <p className="mt-1 text-xs text-mute">Your real card cost incl. bank fees, e.g. 130.</p>
        </div>
        <div>
          <label className="label" htmlFor="walletMarkupPercent">Your markup (%)</label>
          <input id="walletMarkupPercent" name="walletMarkupPercent" className="input" inputMode="numeric" value={markup} onChange={(e) => setMarkup(e.target.value)} required />
          <p className="mt-1 text-xs text-mute">33% markup = 25% profit on every taka used.</p>
        </div>
      </div>

      {model === "custom" && (
        <div className="grid gap-4 rounded-xl bg-ground p-3 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="customModelId">Model ID</label>
            <input id="customModelId" name="customModelId" className="input font-mono" defaultValue={knownId === "custom" ? initial.modelId : ""} />
          </div>
          <div>
            <label className="label" htmlFor="customInput">Input $ / million tokens</label>
            <input id="customInput" name="customInput" className="input" value={cin} onChange={(e) => setCin(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="customOutput">Output $ / million tokens</label>
            <input id="customOutput" name="customOutput" className="input" value={cout} onChange={(e) => setCout(e.target.value)} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 rounded-xl border border-brand-600/30 bg-brand-50 p-4 md:grid-cols-4" data-testid="settings-preview">
        <div><div className="text-xs text-mute">Your cost / typical message</div><div className="num text-lg font-bold">৳{cost.toFixed(2)}</div></div>
        <div><div className="text-xs text-mute">Customer pays</div><div className="num text-lg font-bold">৳{price.toFixed(2)}</div></div>
        <div><div className="text-xs text-mute">Your profit / message</div><div className="num text-lg font-bold text-brand-700">৳{(price - cost).toFixed(2)}</div></div>
        <div><div className="text-xs text-mute">Profit margin</div><div className="num text-lg font-bold text-brand-700">{margin.toFixed(1)}%</div></div>
        <p className="col-span-2 text-xs text-mute md:col-span-4">Typical message = about 3,000 tokens read + 700 written (a Bangla answer in an ongoing chat). Real charges use the actual tokens of each reply.</p>
      </div>

      <div className="space-y-2">
        <div className="label">Top-up packs</div>
        <input type="hidden" name="packs" value={JSON.stringify(packs.map((p) => ({ name: p.name, amount: Math.round(Number(p.amount) * 100), bonusPercent: Number(p.bonus) || 0 })))} />
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Price (৳)</th><th>Bonus %</th><th>Customer gets</th><th>Profit if fully used*</th><th>Profit if first top-up*</th><th></th></tr></thead>
            <tbody>
              {packs.map((p, i) => {
                const amt = Number(p.amount) || 0;
                const safe = Math.max(0, Math.floor(amt * ((1 - 0.015 - 0.05) * (100 + (Number(markup) || 0)) / 100 - 1)));
                const bonus = Math.min(safe, Math.floor((amt * (Number(p.bonus) || 0)) / 100));
                const first = Math.min(safe, Math.max(bonus, Math.min(Math.floor((amt * (Number(firstPct) || 0)) / 100), Number(firstCap) || 0)));
                const m1 = packMargin(amt, bonus);
                const m2 = packMargin(amt, first);
                const set = (k: "name" | "amount" | "bonus", v: string) => setPacks((ps) => ps.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
                return (
                  <tr key={i}>
                    <td><input className="input min-w-24 py-1.5" value={p.name} onChange={(e) => set("name", e.target.value)} aria-label="Pack name" /></td>
                    <td><input className="input w-24 py-1.5" inputMode="numeric" value={p.amount} onChange={(e) => set("amount", e.target.value)} aria-label="Price" /></td>
                    <td><input className="input w-20 py-1.5" inputMode="numeric" value={p.bonus} onChange={(e) => set("bonus", e.target.value)} aria-label="Bonus percent" /></td>
                    <td className="num">৳{amt + bonus}</td>
                    <td className={`num font-semibold ${m1 < 5 ? "text-red-700" : "text-brand-700"}`}>{m1.toFixed(1)}%</td>
                    <td className={`num font-semibold ${m2 < 5 ? "text-red-700" : "text-brand-700"}`}>{m2.toFixed(1)}%</td>
                    <td><button type="button" className="text-sm text-red-700" onClick={() => setPacks((ps) => ps.filter((_, j) => j !== i))} aria-label="Remove pack">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="text-sm font-semibold text-brand-700" onClick={() => setPacks((ps) => [...ps, { name: "New", amount: "200", bonus: "0" }])}>+ Add pack</button>
        <div className="grid max-w-lg grid-cols-2 gap-3 pt-1">
          <div>
            <label className="label" htmlFor="firstTopupBonusPercent">First top-up bonus (%)</label>
            <input id="firstTopupBonusPercent" name="firstTopupBonusPercent" className="input" inputMode="numeric" value={firstPct} onChange={(e) => setFirstPct(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="firstTopupBonusCap">Max first bonus (৳)</label>
            <input id="firstTopupBonusCap" name="firstTopupBonusCap" className="input" inputMode="numeric" value={firstCap} onChange={(e) => setFirstCap(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-mute">*Worst case: the customer uses every taka of balance incl. bonus, after ~1.5% bKash fee. Pack bonus and first bonus don&apos;t stack — the larger one is given. Safety cap: if a bonus would push profit below 5%, it is automatically reduced (shown here as the real amount the customer gets). Raise the markup to 33% to allow the full bonuses.</p>
      </div>

      <details className="rounded-xl border border-line p-3">
        <summary className="cursor-pointer text-sm font-semibold">Advanced (reply length & thinking)</summary>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="maxOutputTokens">Max reply length (tokens)</label>
            <input id="maxOutputTokens" name="maxOutputTokens" type="number" className="input" defaultValue={initial.maxOutputTokens} />
          </div>
          <div>
            <label className="label" htmlFor="minOutputTokens">Minimum balance needed (tokens)</label>
            <input id="minOutputTokens" name="minOutputTokens" type="number" className="input" defaultValue={initial.minOutputTokens} />
            <p className="mt-1 text-xs text-mute">If a customer can&apos;t afford this many, chat asks them to top up.</p>
          </div>
          <div>
            <label className="label" htmlFor="effort">Thinking effort</label>
            <select id="effort" name="effort" className="input" defaultValue={initial.effort}>
              <option value="low">low (cheapest, recommended)</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="">model default</option>
            </select>
          </div>
        </div>
      </details>

      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">{state.ok}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
    </form>
  );
}
