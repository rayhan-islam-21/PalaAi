"use client";
import { useActionState } from "react";

export type ActionState = { error?: string; ok?: string } | null;
export type FormAction = (prev: ActionState, data: FormData) => Promise<ActionState>;

export function ActionForm({
  action,
  children,
  submitLabel,
  submitClass = "btn-primary w-full",
  confirm,
  className = "space-y-3",
}: {
  action: FormAction;
  children?: React.ReactNode;
  submitLabel: string;
  submitClass?: string;
  confirm?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">{state.ok}</p>}
      <button type="submit" className={submitClass} disabled={pending}>
        {pending ? "অপেক্ষা করুন…" : submitLabel}
      </button>
    </form>
  );
}
