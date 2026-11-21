import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { ActionForm } from "@/components/ActionForm";
import { SignOutButton } from "@/components/SignOutButton";
import { taka } from "@/lib/money";
import { formatDhaka } from "@/lib/slots";
import { changePasswordAction, deleteAccountAction, updateProfileAction } from "@/app/account-actions";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser("/account");
  const [full, wallet] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { createdAt: true } }),
    prisma.wallet.findUnique({ where: { userId: user.id } }),
  ]);
  const balance = wallet?.balance ?? 0;
  return (
    <AppShell>
      <h1 className="h1">আমার অ্যাকাউন্ট</h1>
      <p className="muted mt-1">{user.email} · সদস্য {formatDhaka(full.createdAt, false)} থেকে</p>

      <section className="card mt-4 space-y-3">
        <h2 className="h2">প্রোফাইল</h2>
        <ActionForm action={updateProfileAction} submitLabel="সেভ করুন" submitClass="btn-primary">
          <div>
            <label className="label" htmlFor="name">নাম</label>
            <input className="input" id="name" name="name" defaultValue={user.name} maxLength={60} required />
          </div>
          <div>
            <label className="label" htmlFor="phone">মোবাইল নম্বর (ঐচ্ছিক)</label>
            <input className="input" id="phone" name="phone" inputMode="tel" defaultValue={user.phone ?? ""} placeholder="01XXXXXXXXX" />
            <p className="mt-1 text-xs text-mute">পেমেন্ট বা সাপোর্টের দরকারে যোগাযোগের জন্য।</p>
          </div>
        </ActionForm>
      </section>

      <section className="card mt-3 space-y-3">
        <h2 className="h2">পাসওয়ার্ড বদলান</h2>
        <ActionForm action={changePasswordAction} submitLabel="পাসওয়ার্ড বদলান" submitClass="btn-secondary">
          <div>
            <label className="label" htmlFor="current">বর্তমান পাসওয়ার্ড</label>
            <input className="input" id="current" name="current" type="password" autoComplete="current-password" required />
          </div>
          <div>
            <label className="label" htmlFor="next">নতুন পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)</label>
            <input className="input" id="next" name="next" type="password" minLength={8} autoComplete="new-password" required />
          </div>
          <div>
            <label className="label" htmlFor="confirm">নতুন পাসওয়ার্ড আবার লিখুন</label>
            <input className="input" id="confirm" name="confirm" type="password" minLength={8} autoComplete="new-password" required />
          </div>
        </ActionForm>
      </section>

      <section className="card mt-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="h2">লগআউট</h2>
          <p className="muted">এই ডিভাইস থেকে বের হন।</p>
        </div>
        <SignOutButton />
      </section>

      <details className="mt-3 rounded-2xl border border-red-200 bg-white p-4">
        <summary className="cursor-pointer font-semibold text-red-700">অ্যাকাউন্ট মুছে ফেলুন</summary>
        <div className="mt-3 space-y-3 text-[15px]">
          <ul className="list-disc space-y-1 pl-5 text-mute">
            <li>আপনার সব চ্যাট চিরতরে মুছে যাবে।</li>
            <li>পেমেন্টের হিসাব আইনগত কারণে নাম ছাড়া রেখে দেওয়া হবে।</li>
            {balance > 0 && <li className="font-semibold text-red-700">আপনার ওয়ালেটে এখনো {taka(balance)} আছে — মুছলে এই টাকা আর ফেরত পাবেন না। চাইলে আগে <Link href="/support" className="underline">সাপোর্টে</Link> যোগাযোগ করুন।</li>}
          </ul>
          <ActionForm action={deleteAccountAction} submitLabel="চিরতরে মুছে ফেলুন" submitClass="btn-danger w-full" confirm="আপনি কি নিশ্চিত? এটা আর ফেরানো যাবে না।">
            <div>
              <label className="label" htmlFor="del-password">পাসওয়ার্ড</label>
              <input className="input" id="del-password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <div>
              <label className="label" htmlFor="del-confirm">নিশ্চিত করতে লিখুন: DELETE</label>
              <input className="input" id="del-confirm" name="confirm" autoComplete="off" autoCapitalize="characters" required />
            </div>
          </ActionForm>
        </div>
      </details>
    </AppShell>
  );
}
