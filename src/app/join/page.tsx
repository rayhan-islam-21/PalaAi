import { AppShell } from "@/components/AppShell";
import { ActionForm } from "@/components/ActionForm";
import { goToCodeAction } from "@/app/actions";

export default function JoinByCode() {
  return (
    <AppShell>
      <h1 className="h1">কোড দিয়ে গ্রুপে যোগ দিন</h1>
      <p className="muted mt-1">বন্ধুর পাঠানো ৬ অক্ষরের কোডটি লিখুন।</p>
      <div className="card mt-4">
        <ActionForm action={goToCodeAction} submitLabel="গ্রুপ খুঁজুন">
          <input className="input text-center font-mono text-2xl uppercase tracking-widest" name="code" placeholder="ABC123" maxLength={12} autoCapitalize="characters" autoComplete="off" required aria-label="গ্রুপ কোড" />
        </ActionForm>
      </div>
    </AppShell>
  );
}
