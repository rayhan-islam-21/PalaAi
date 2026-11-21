"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { currentTime } from "@/lib/clock";
import { errorMessage } from "@/lib/errors";
import { createGroup, joinGroup, leaveGroup, cancelGroup, renewGroup, findGroupByCode, normalizeCode } from "@/lib/services/groups";
import { submitClaim } from "@/lib/services/payments";
import type { ActionState } from "@/components/ActionForm";
import { GROUPS_ENABLED } from "@/lib/features";

const GROUPS_OFF: ActionState = { error: "গ্রুপ পাস এখন বন্ধ আছে।" };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function createGroupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  if (!GROUPS_ENABLED) return GROUPS_OFF;
  const user = await requireUser();
  let id: string;
  try {
    const g = await createGroup(prisma, {
      userId: user.id,
      name: str(fd, "name"),
      seats: parseInt(str(fd, "seats"), 10),
      slotIndex: parseInt(str(fd, "slotIndex"), 10),
      now: await currentTime(prisma),
    });
    id = g.id;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(`/groups/${id}?created=1`);
}

export async function goToCodeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  if (!GROUPS_ENABLED) return GROUPS_OFF;
  const code = normalizeCode(str(fd, "code"));
  if (code.length < 4) return { error: "সঠিক কোড লিখুন।" };
  const g = await findGroupByCode(prisma, code);
  if (!g) return { error: "এই কোডে কোনো গ্রুপ পাওয়া যায়নি।" };
  redirect(`/join/${code}`);
}

export async function joinGroupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  if (!GROUPS_ENABLED) return GROUPS_OFF;
  const code = str(fd, "code");
  const user = await requireUser(`/join/${code}`);
  let groupId: string;
  try {
    const slot = fd.get("slotIndex");
    if (slot === null) return { error: "একটি সময় বেছে নিন।" };
    const r = await joinGroup(prisma, { userId: user.id, code, slotIndex: parseInt(String(slot), 10), now: await currentTime(prisma) });
    groupId = r.group.id;
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(`/groups/${groupId}?joined=1`);
}

export async function leaveGroupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  if (!GROUPS_ENABLED) return GROUPS_OFF;
  const user = await requireUser();
  try {
    await leaveGroup(prisma, { userId: user.id, groupId: str(fd, "groupId"), now: await currentTime(prisma) });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect("/groups?left=1");
}

export async function cancelGroupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  if (!GROUPS_ENABLED) return GROUPS_OFF;
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  try {
    await cancelGroup(prisma, { actorId: user.id, isAdmin: false, groupId, reason: str(fd, "reason") || "গ্রুপ তৈরিকারী বাতিল করেছেন", now: await currentTime(prisma) });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/groups/${groupId}`);
  return { ok: "গ্রুপ বাতিল হয়েছে। যারা টাকা দিয়েছেন তাদের টাকা ফেরত দেওয়া হবে।" };
}

export async function renewGroupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  if (!GROUPS_ENABLED) return GROUPS_OFF;
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  try {
    await renewGroup(prisma, { userId: user.id, groupId, now: await currentTime(prisma) });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(`/groups/${groupId}`);
  return { ok: "নতুন মাসের জন্য রিনিউ শুরু হয়েছে। সবাই নিজের অংশ পাঠালে চালু হবে।" };
}

export async function submitPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    const purpose = str(fd, "purpose") as "WALLET_TOPUP" | "GROUP_SHARE";
    if (purpose === "GROUP_SHARE" && !GROUPS_ENABLED) return GROUPS_OFF;
    await submitClaim(prisma, {
      userId: user.id,
      purpose,
      provider: str(fd, "provider"),
      transactionId: str(fd, "transactionId"),
      senderNumber: str(fd, "senderNumber"),
      amount: parseInt(str(fd, "amount"), 10) || undefined,
      shareId: str(fd, "shareId") || undefined,
    });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect("/payments?submitted=1");
}
