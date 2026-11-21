import { notFound } from "next/navigation";
import { prisma } from "./db";
import { requireUser } from "./session";
import { currentTime } from "./clock";
import { activeAllowances } from "./services/groups";
import { getConversationForUser } from "./services/chat";
import { getProvider } from "./ai/provider";
import { formatSlot } from "./slots";
import { ChatApp, type ChatMessage } from "@/components/ChatApp";

export async function ChatPage({ conversationId }: { conversationId: string | null }) {
  const user = await requireUser(conversationId ? `/chat/${conversationId}` : "/chat");
  const now = await currentTime(prisma);
  const [conversations, wallet, allowances, conv] = await Promise.all([
    prisma.conversation.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, title: true } }),
    prisma.wallet.findUnique({ where: { userId: user.id } }),
    activeAllowances(prisma, user.id, now),
    conversationId ? getConversationForUser(prisma, user.id, conversationId) : Promise.resolve(null),
  ]);
  if (conversationId && !conv) notFound(); // also covers other users' conversations
  const { provider, reason } = getProvider();
  return (
    <ChatApp
      key={conversationId ?? "new"}
      conversationId={conversationId}
      conversations={conversations}
      initialMessages={(conv?.messages ?? []).map(
        (m): ChatMessage => ({ id: m.id, role: m.role === "assistant" ? "assistant" : "user", content: m.content, status: m.status, charge: m.charge, fundingSource: m.fundingSource }),
      )}
      walletBalance={wallet?.balance ?? 0}
      groups={allowances.map((a) => ({
        shareId: a.shareId,
        groupName: a.groupName,
        slotLabel: formatSlot(a.slot),
        remaining: a.remaining,
        inSlot: !!a.window?.active,
        windowStart: a.window?.start.toISOString() ?? null,
        windowEnd: a.window?.end.toISOString() ?? null,
      }))}
      disabledReason={provider ? null : (reason ?? "চ্যাট বন্ধ")}
      providerLabel={provider?.label ?? null}
      serverNow={now.toISOString()}
    />
  );
}
