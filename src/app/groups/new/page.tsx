import { GROUPS_ENABLED } from "@/lib/features";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { AppShell } from "@/components/AppShell";
import { GroupCreateForm } from "@/components/GroupCreateForm";
import { createGroupAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function NewGroup() {
  if (!GROUPS_ENABLED) redirect("/dashboard");
  await requireUser("/groups/new");
  const s = await getSettings(prisma);
  return (
    <AppShell>
      <h1 className="h1 mb-3">নতুন গ্রুপ তৈরি করুন</h1>
      <GroupCreateForm action={createGroupAction} pool={s.poolAmount} fee={s.serviceFeePerMember} schedule4={s.schedule4} schedule5={s.schedule5} />
    </AppShell>
  );
}
