"use client";
import { useActionState } from "react";
import type { FormAction } from "./ActionForm";

export function JoinCodeForm({ action, compact = false }: { action: FormAction; compact?: boolean }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={compact ? "" : "rounded-2xl border border-dashed border-[#b9c7bf] bg-[#f2f5f3] p-2.5"}>
      <label htmlFor="join-code" className="mb-1.5 block px-1 text-sm font-semibold text-ink-2">কোড দিয়ে গ্রুপে যোগ দিন</label>
      <div className="flex gap-2">
        <input
          id="join-code"
          name="code"
          placeholder="যেমন ABC123"
          maxLength={12}
          autoCapitalize="characters"
          autoComplete="off"
          required
          className="num h-12 min-w-0 flex-1 rounded-[11px] border border-[#cfd8d3] bg-white px-3.5 text-base uppercase tracking-[2px] text-ink outline-none focus:border-brand-600"
        />
        <button className="h-12 shrink-0 rounded-[11px] bg-ink px-4 text-[15px] font-semibold text-white disabled:opacity-60" disabled={pending}>
          {pending ? "…" : "যোগ দিন"}
        </button>
      </div>
      {state?.error && <p role="alert" className="mt-2 px-1 text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
