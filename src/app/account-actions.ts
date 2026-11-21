"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/session";
import { currentTime } from "@/lib/clock";
import { errorMessage } from "@/lib/errors";
import { cancelOwnClaim, changePassword, deleteAccount, deleteConversation, renameConversation, updateProfile } from "@/lib/services/account";
import type { ActionState } from "@/components/ActionForm";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("/account");
  try {
    await updateProfile(prisma, u.id, { name: str(fd, "name"), phone: str(fd, "phone") });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/", "layout");
  return { ok: "প্রোফাইল সেভ হয়েছে।" };
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("/account");
  if (str(fd, "next") !== str(fd, "confirm")) return { error: "নতুন পাসওয়ার্ড দুটি মেলেনি।" };
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    await changePassword(prisma, u.id, { current: str(fd, "current"), next: str(fd, "next"), sessionToken: session?.session.token });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  return { ok: "পাসওয়ার্ড বদলানো হয়েছে। অন্য সব ডিভাইস থেকে লগআউট করা হয়েছে।" };
}

export async function deleteAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("/account");
  try {
    await deleteAccount(prisma, u.id, { password: str(fd, "password"), confirm: str(fd, "confirm"), now: await currentTime(prisma) });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect("/?deleted=1");
}

export async function cancelClaimAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("/payments");
  try {
    await cancelOwnClaim(prisma, u.id, str(fd, "claimId"));
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/payments");
  return { ok: "পেমেন্টটি বাতিল হয়েছে।" };
}

/** Called from the chat UI (not a form), returns a plain result. */
export async function renameChat(conversationId: string, title: string): Promise<{ error?: string }> {
  const u = await requireUser("/chat");
  try {
    await renameConversation(prisma, u.id, conversationId, title);
    return {};
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function deleteChat(conversationId: string): Promise<{ error?: string }> {
  const u = await requireUser("/chat");
  try {
    await deleteConversation(prisma, u.id, conversationId);
    return {};
  } catch (e) {
    return { error: errorMessage(e) };
  }
}
