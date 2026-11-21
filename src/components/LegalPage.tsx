import { AppShell } from "./AppShell";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <AppShell footer>
      <article className="space-y-4 text-[15.5px] leading-relaxed [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_li]:my-1 [&_ul]:list-disc [&_ul]:pl-5">
        <header>
          <h1 className="h1">{title}</h1>
          <p className="muted">সর্বশেষ হালনাগাদ: {updated}</p>
        </header>
        {children}
      </article>
    </AppShell>
  );
}
