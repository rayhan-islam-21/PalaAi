import { ChatPage } from "@/lib/chat-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return <ChatPage conversationId={null} />;
}
