"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

function safeNext(n: string | null) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") || "").trim();
    const password = String(f.get("password") || "");
    setPending(true);
    try {
      const res =
        mode === "signup"
          ? await authClient.signUp.email({ email, password, name: String(f.get("name") || "").trim() || email.split("@")[0] })
          : await authClient.signIn.email({ email, password });
      if (res.error) {
        const code = res.error.code ?? "";
        setError(
          code.includes("USER_ALREADY_EXISTS")
            ? "এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট আছে। লগইন করুন।"
            : code.includes("PASSWORD_TOO_SHORT")
              ? "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।"
              : code.includes("INVALID_EMAIL_OR_PASSWORD")
                ? "ইমেইল বা পাসওয়ার্ড ভুল।"
                : res.error.message || "সমস্যা হয়েছে, আবার চেষ্টা করুন।",
        );
        return;
      }
      // Full navigation so every server component sees the new session cookie at once.
      window.location.assign(next);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="h1">{mode === "signup" ? "অ্যাকাউন্ট খুলুন" : "লগইন করুন"}</h1>
      <p className="muted mt-1">{mode === "signup" ? "১ মিনিটেই শুরু করুন।" : "আবার স্বাগতম!"}</p>
      {params.get("blocked") && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">এই অ্যাকাউন্টটি বন্ধ আছে। সাহায্যের জন্য সাপোর্টে যোগাযোগ করুন।</p>
      )}
      <form method="post" onSubmit={onSubmit} className="card mt-4 space-y-3">
        {mode === "signup" && (
          <div>
            <label className="label" htmlFor="name">আপনার নাম</label>
            <input className="input" id="name" name="name" autoComplete="name" required maxLength={60} />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">ইমেইল</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required inputMode="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">পাসওয়ার্ড</label>
          <input className="input" id="password" name="password" type="password" minLength={8} required autoComplete={mode === "signup" ? "new-password" : "current-password"} />
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full" disabled={pending || !ready}>{pending ? "অপেক্ষা করুন…" : mode === "signup" ? "অ্যাকাউন্ট খুলুন" : "লগইন"}</button>
      </form>
      {mode === "login" && (
        <p className="mt-3 text-center text-sm text-mute">পাসওয়ার্ড ভুলে গেছেন? <a className="font-semibold text-brand-700" href="/support">সাপোর্টে যোগাযোগ করুন</a> — আমরা নতুন পাসওয়ার্ড দিয়ে দেব।</p>
      )}
      <p className="mt-4 text-center text-sm">
        {mode === "signup" ? (
          <>আগেই অ্যাকাউন্ট আছে? <Link className="font-semibold text-brand-700" href={`/login?next=${encodeURIComponent(next)}`}>লগইন করুন</Link></>
        ) : (
          <>নতুন? <Link className="font-semibold text-brand-700" href={`/signup?next=${encodeURIComponent(next)}`}>অ্যাকাউন্ট খুলুন</Link></>
        )}
      </p>
    </div>
  );
}
