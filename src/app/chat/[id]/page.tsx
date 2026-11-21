import { ChatPage } from "@/lib/chat-page";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatPage conversationId={id} />;
}
