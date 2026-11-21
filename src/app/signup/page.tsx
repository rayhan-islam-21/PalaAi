import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthForm } from "@/components/auth/AuthForm";

export default function Page() {
  return (
    <AppShell>
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </AppShell>
  );
}
