import { after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { currentTime } from "@/lib/clock";
import { AppError } from "@/lib/errors";
import { getProvider } from "@/lib/ai/provider";
import { prepareChat, runChat, type StreamEvent } from "@/lib/services/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return json({ error: "লগইন করুন।", code: "UNAUTHENTICATED" }, 401);

  const { provider, reason } = getProvider();
  if (!provider) return json({ error: reason, code: "CHAT_DISABLED" }, 503);

  let body: { conversationId?: string | null; clientRequestId?: string; text?: string; source?: string; shareId?: string | null };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request", code: "BAD_JSON" }, 400);
  }

  let prepared;
  try {
    prepared = await prepareChat(prisma, provider, {
      userId: session.user.id,
      conversationId: body.conversationId ?? null,
      clientRequestId: String(body.clientRequestId ?? ""),
      text: String(body.text ?? ""),
      source: body.source as "WALLET" | "GROUP",
      shareId: body.shareId ?? null,
      now: await currentTime(prisma),
    });
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.message, code: e.code, details: e.details }, e.status);
    console.error(e);
    return json({ error: "সার্ভারে সমস্যা হয়েছে।", code: "SERVER" }, 500);
  }

  if ("duplicate" in prepared) return json(prepared, 200);
  const p = prepared;

  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let open = true;
  const emit = (e: StreamEvent) => {
    if (!open || !controller) return;
    try {
      controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
    } catch {
      open = false; // client went away; generation and settlement continue
    }
  };
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      open = false;
    },
  });
  // Generation is decoupled from the HTTP response so a disconnect can't skip settlement.
  const job = (async () => {
    // Clock is read once per settlement; demo clock offset is preserved.
    const base = await currentTime(prisma);
    const started = Date.now();
    await runChat(prisma, provider, p, emit, () => new Date(base.getTime() + (Date.now() - started)));
  })()
    .catch((e) => console.error("chat job failed", e))
    .finally(() => {
      if (open && controller) {
        try {
          controller.close();
        } catch {}
      }
    });
  after(() => job);

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
