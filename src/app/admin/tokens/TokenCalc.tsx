"use client";
import { useActionState } from "react";
import { tokenCalcAction, type TokenCalcState } from "../actions";

const t = (p: number) => `৳${(p / 100).toFixed(2)}`;

const SAMPLES = {
  bn: {
    q: "আমার জন্য একটা ছুটির দরখাস্ত লিখে দাও, আগামীকাল জ্বরের কারণে অফিসে যেতে পারব না।",
    a: "বরাবর,\nব্যবস্থাপক, মানবসম্পদ বিভাগ\n\nবিষয়: এক দিনের ছুটির আবেদন।\n\nজনাব,\nবিনীত নিবেদন এই যে, আমি গতকাল রাত থেকে জ্বরে ভুগছি। চিকিৎসকের পরামর্শ অনুযায়ী আমাকে বিশ্রামে থাকতে হবে। তাই আগামীকাল অফিসে উপস্থিত হতে পারব না। অনুগ্রহ করে আমাকে এক দিনের ছুটি মঞ্জুর করার জন্য আবেদন জানাচ্ছি।\n\nবিনীত,\nআপনার বিশ্বস্ত কর্মী",
  },
  en: {
    q: "Write a short email to my manager asking for one day of sick leave tomorrow.",
    a: "Subject: Sick Leave Request for Tomorrow\n\nDear Manager,\n\nI am not feeling well and have been advised by my doctor to rest. I would like to request one day of sick leave tomorrow. I will make sure my pending tasks are covered and will be reachable by phone if anything urgent comes up.\n\nThank you for your understanding.\n\nBest regards,\n[Your Name]",
  },
};

export function TokenCalc() {
  const [state, action, pending] = useActionState<TokenCalcState, FormData>(tokenCalcAction, null);
  return (
    <div className="space-y-4">
      <form action={action} className="card space-y-3">
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="text-mute">Fill a sample:</span>
          {(["bn", "en"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className="rounded-lg px-2 py-1 font-semibold text-brand-700 ring-1 ring-line hover:bg-ground"
              onClick={(e) => {
                const f = e.currentTarget.closest("form") as HTMLFormElement;
                (f.elements.namedItem("question") as HTMLTextAreaElement).value = SAMPLES[k].q;
                (f.elements.namedItem("answer") as HTMLTextAreaElement).value = SAMPLES[k].a;
              }}
            >
              {k === "bn" ? "Bangla leave application" : "English sick-leave email"}
            </button>
          ))}
        </div>
        <div>
          <label className="label" htmlFor="question">What the customer types</label>
          <textarea key={`q-${state?.question ?? ""}`} defaultValue={state?.question ?? ""} id="question" name="question" rows={4} className="input" placeholder="Paste or type any Bangla / English / Banglish message" />
        </div>
        <div>
          <label className="label" htmlFor="answer">A sample AI answer (what the AI writes back)</label>
          <textarea key={`a-${state?.answer ?? ""}`} defaultValue={state?.answer ?? ""} id="answer" name="answer" rows={6} className="input" placeholder="Paste a typical answer to see its output cost" />
        </div>
        <div className="max-w-xs">
          <label className="label" htmlFor="history">Earlier chat in the same conversation (tokens)</label>
          <input id="history" name="history" type="number" min={0} step={100} defaultValue={state?.history ?? 0} key={`h-${state?.history ?? 0}`} className="input" />
          <p className="mt-1 text-xs text-mute">0 = first message of a new chat. A 10-message chat is often 3,000–6,000.</p>
        </div>
        {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
        <button className="btn-primary" disabled={pending}>{pending ? "Counting…" : "Count tokens & cost"}</button>
      </form>

      {state?.rows && (
        <div className="space-y-3" data-testid="token-result">
          <p className={`rounded-lg px-3 py-2 text-sm ${state.exact ? "bg-brand-50 text-brand-900" : "bg-amber-50 text-amber-900"}`}>
            {state.exact
              ? "Exact token counts from Anthropic's token-counting API."
              : "ESTIMATE ONLY — no ANTHROPIC_API_KEY on this server, so counts use a rough rule (≈4 English characters or ≈1 Bangla character per token)."}{" "}
            Rate ৳{state.usdToBdt} per $1 · wallet markup {state.markup}%.
          </p>
          <div className="card grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><div className="text-mute">Customer message</div><div className="num font-bold">{state.words!.question} words · {state.chars!.question} chars</div></div>
            <div><div className="text-mute">AI answer</div><div className="num font-bold">{state.words!.answer} words · {state.chars!.answer} chars</div></div>
            <div><div className="text-mute">Tokens per word (message)</div><div className="num font-bold">{state.words!.question ? (state.rows[0].question / state.words!.question).toFixed(1) : "—"}</div></div>
            <div><div className="text-mute">Tokens per word (answer)</div><div className="num font-bold">{state.words!.answer ? (state.rows[0].answer / state.words!.answer).toFixed(1) : "—"}</div></div>
          </div>
          <div className="card overflow-x-auto p-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model</th><th>Input tokens (system + earlier chat + message)</th><th>Output tokens</th><th>Your cost</th><th>Customer pays</th><th>Your profit</th><th>With caching: cost → pays</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((r) => (
                  <tr key={r.label}>
                    <td className="font-semibold">{r.label}</td>
                    <td className="num">{r.input.toLocaleString()} <span className="text-mute">({r.system} + {state.history} + {r.question})</span></td>
                    <td className="num">{r.output.toLocaleString()}</td>
                    <td className="num">{t(r.costPoisha)}</td>
                    <td className="num font-bold">{t(r.chargePoisha)}</td>
                    <td className="num text-brand-700">{t(r.chargePoisha - r.costPoisha)}</td>
                    <td className="num">{t(r.cachedCostPoisha)} → {t(r.cachedChargePoisha)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-mute">
            Output on Opus 5.5 also includes hidden “thinking” tokens, so real Opus answers cost somewhat more than this. Real per-request tokens and costs are recorded in Usage &amp; ledger.
          </p>
        </div>
      )}
    </div>
  );
}
