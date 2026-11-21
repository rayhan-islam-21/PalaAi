"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { Countdown } from "./Countdown";
import { takaPrecise } from "@/lib/money";
import { LogoMark } from "./Icons";
import { CopyButton } from "./CopyButton";
import { deleteChat, renameChat } from "@/app/account-actions";

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; status: string; charge: number | null; fundingSource: string | null };
export type ConversationItem = { id: string; title: string };
export type GroupFunding = {
  shareId: string;
  groupName: string;
  slotLabel: string;
  remaining: number;
  inSlot: boolean;
  windowStart: string | null;
  windowEnd: string | null;
};

type Props = {
  conversationId: string | null;
  conversations: ConversationItem[];
  initialMessages: ChatMessage[];
  walletBalance: number;
  groups: GroupFunding[];
  disabledReason: string | null;
  providerLabel: string | null;
  serverNow: string;
};

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

type Source = "WALLET" | "GROUP";

export function ChatApp(props: Props) {
  const [conversationId, setConversationId] = useState(props.conversationId);
  const [messages, setMessages] = useState<ChatMessage[]>(props.initialMessages);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [conversations, setConversations] = useState(props.conversations);
  const [menu, setMenu] = useState(false);
  const currentTitle = conversations.find((c) => c.id === conversationId)?.title ?? null;

  async function rename() {
    setMenu(false);
    if (!conversationId) return;
    const t = window.prompt("চ্যাটের নতুন নাম:", currentTitle ?? "");
    if (!t || !t.trim()) return;
    const r = await renameChat(conversationId, t);
    if (r.error) return setError(r.error);
    setConversations((cs) => cs.map((c) => (c.id === conversationId ? { ...c, title: t.trim().slice(0, 80) } : c)));
  }

  async function remove() {
    setMenu(false);
    if (!conversationId || !window.confirm("এই চ্যাটটি চিরতরে মুছে ফেলবেন?")) return;
    const r = await deleteChat(conversationId);
    if (r.error) return setError(r.error);
    window.location.href = "/chat";
  }
  const groupInSlot = props.groups.find((g) => g.inSlot) ?? null;
  // Group allowance is used automatically only inside the member's own slot; the wallet must be chosen explicitly.
  const [source, setSource] = useState<Source | null>(groupInSlot ? "GROUP" : props.groups.length === 0 ? "WALLET" : null);
  const [wallet, setWallet] = useState(props.walletBalance);
  const [groupRemaining, setGroupRemaining] = useState(groupInSlot?.remaining ?? 0);
  const [lastCharge, setLastCharge] = useState<{ charged: number; remaining: number; source: Source } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const nextGroup = [...props.groups].filter((g) => g.windowStart).sort((a, b) => a.windowStart!.localeCompare(b.windowStart!))[0];
  const balance = source === "GROUP" ? groupRemaining : wallet;

  async function send(retryId?: string, retryText?: string) {
    const body = (retryText ?? text).trim();
    if (!body || busy || !source) return;
    setError(null);
    setBusy(true);
    const clientRequestId = retryId ?? uuid();
    const tempUser: ChatMessage = { id: "u-" + clientRequestId, role: "user", content: body, status: "COMPLETE", charge: null, fundingSource: null };
    const tempAsst: ChatMessage = { id: "a-" + clientRequestId, role: "assistant", content: "", status: "STREAMING", charge: null, fundingSource: source };
    if (!retryId) {
      setMessages((m) => [...m, tempUser, tempAsst]);
      setText("");
    }
    const update = (fn: (m: ChatMessage) => ChatMessage) =>
      setMessages((all) => all.map((m) => (m.id === tempAsst.id ? fn(m) : m)));
    let newConvId: string | null = null;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, clientRequestId, text: body, source, shareId: source === "GROUP" ? groupInSlot?.shareId : null }),
      });
      const ctype = res.headers.get("content-type") ?? "";
      if (!ctype.includes("ndjson")) {
        const data = await res.json().catch(() => ({}));
        if (data.duplicate) {
          // Same request already processed: show stored result, never re-generate.
          update((m) => ({ ...m, content: data.content ?? "", status: data.status === "COMPLETED" ? "COMPLETE" : "STREAMING", charge: data.charged }));
          if (!conversationId && data.conversationId) newConvId = data.conversationId;
          return;
        }
        setMessages((all) => all.filter((m) => m.id !== tempAsst.id && m.id !== tempUser.id));
        setText(body);
        setError(data.error ?? "সমস্যা হয়েছে।");
        if (data.code === "OUT_OF_SLOT") setSource(null);
        return;
      }
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "meta") {
            if (!conversationId) newConvId = ev.conversationId;
          } else if (ev.type === "delta") {
            update((m) => ({ ...m, content: m.content + ev.text }));
          } else if (ev.type === "done") {
            update((m) => ({ ...m, status: "COMPLETE", charge: ev.charged }));
            setLastCharge({ charged: ev.charged, remaining: ev.remaining, source });
            if (source === "GROUP") setGroupRemaining(ev.remaining);
            else setWallet(ev.remaining);
          } else if (ev.type === "error") {
            update((m) => ({ ...m, status: "FAILED", charge: ev.charged }));
            setError(ev.message);
            setLastCharge({ charged: ev.charged, remaining: ev.remaining, source });
            if (source === "GROUP") setGroupRemaining(ev.remaining);
            else setWallet(ev.remaining);
          }
        }
      }
    } catch {
      // Network dropped: the server keeps generating and settles once. Retrying with the
      // same id returns the stored result instead of a second (free or double-charged) answer.
      setError("সংযোগ বিচ্ছিন্ন হয়েছে। আবার লোড করলে উত্তরটি দেখতে পাবেন।");
    } finally {
      setBusy(false);
      if (newConvId) {
        const id = newConvId;
        setConversationId(id);
        setConversations((cs) => [{ id, title: body.replace(/\s+/g, " ").slice(0, 48) }, ...cs.filter((c) => c.id !== id)]);
        window.history.replaceState(null, "", `/chat/${id}`);
      }
      taRef.current?.focus();
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-[#f6f7f5]">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-black/5 bg-white px-2">
        <button className="btn-ghost min-h-9 px-2 py-1 md:hidden" onClick={() => setDrawer(true)} aria-label="চ্যাট তালিকা">☰</button>
        <Link href="/dashboard" className="flex items-center gap-1.5 font-extrabold text-ink" aria-label="Pala AI ড্যাশবোর্ড"><LogoMark size={28} /><span className="num hidden sm:inline">Pala AI</span></Link>
        <span className="min-w-0 truncate text-sm text-gray-500">{currentTitle ?? props.providerLabel}</span>
        {conversationId && (
          <div className="relative ml-auto">
            <button className="btn-ghost min-h-9 px-2 py-1" aria-label="চ্যাটের অপশন" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>⋯</button>
            {menu && (
              <div className="absolute right-0 top-10 z-30 w-44 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/10" role="menu">
                <button role="menuitem" className="block w-full px-4 py-3 text-left text-sm hover:bg-ground" onClick={rename}>নাম বদলান</button>
                <button role="menuitem" className="block w-full px-4 py-3 text-left text-sm text-red-700 hover:bg-red-50" onClick={remove}>চ্যাট মুছে ফেলুন</button>
              </div>
            )}
          </div>
        )}
        <Link href="/chat" className={`btn-secondary min-h-9 py-1 text-sm ${conversationId ? "" : "ml-auto"}`} onClick={() => setDrawer(false)}>+ নতুন চ্যাট</Link>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className={`${drawer ? "fixed inset-0 z-30 flex" : "hidden"} md:static md:flex md:w-64 md:shrink-0`}>
          <div className="flex h-full w-72 flex-col border-r border-black/5 bg-white md:w-64">
            <div className="flex items-center justify-between p-3">
              <span className="font-semibold">আপনার চ্যাট</span>
              <button className="md:hidden" onClick={() => setDrawer(false)} aria-label="বন্ধ করুন">✕</button>
            </div>
            <ul className="flex-1 overflow-y-auto px-2 pb-4" data-testid="conversation-list">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link href={`/chat/${c.id}`} onClick={() => setDrawer(false)} className={`block truncate rounded-lg px-3 py-2 text-sm ${c.id === conversationId ? "bg-brand-50 font-semibold" : "hover:bg-gray-50"}`}>
                    {c.title}
                  </Link>
                </li>
              ))}
              {conversations.length === 0 && <li className="px-3 text-sm text-gray-500">এখনো কোনো চ্যাট নেই</li>}
            </ul>
          </div>
          {drawer && <button className="flex-1 bg-black/30 md:hidden" onClick={() => setDrawer(false)} aria-label="বন্ধ করুন" />}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4" data-testid="messages">
            <div className="mx-auto max-w-3xl space-y-3">
              {messages.length === 0 && (
                <div className="mt-10 text-center text-gray-500">
                  <div className="text-4xl">💬</div>
                  <p className="mt-2">যেকোনো প্রশ্ন লিখুন — বাংলা বা ইংরেজিতে।</p>
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
                  <div className={m.role === "user" ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand-600 px-3 py-2 text-white" : "rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-black/5"}>
                    {m.role === "user" ? m.content : m.content ? <Markdown text={m.content} /> : <span className="animate-pulse text-gray-400">লিখছে…</span>}
                    {m.role === "assistant" && m.status !== "STREAMING" && (
                      <div className="mt-1 text-[11px] text-gray-400">
                        {m.status === "FAILED" ? "অসম্পূর্ণ · " : ""}
                        {m.fundingSource === "GROUP" ? "গ্রুপ অ্যালাওয়েন্স" : m.fundingSource === "WALLET" ? "ব্যক্তিগত ওয়ালেট" : ""}
                        {m.charge != null ? ` · খরচ ${takaPrecise(m.charge)}` : ""}
                        {m.content && <span className="ml-2 inline-block align-middle [&_button]:min-h-7 [&_button]:px-2 [&_button]:py-0 [&_button]:text-[11px]"><CopyButton text={m.content} label="কপি" /></span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="shrink-0 border-t border-black/5 bg-white px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2">
            <div className="mx-auto max-w-3xl">
              {props.disabledReason ? (
                <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" data-testid="chat-disabled">{props.disabledReason}</p>
              ) : (
                <>
                  <FundingBar
                    source={source}
                    setSource={setSource}
                    groupInSlot={groupInSlot}
                    nextGroup={!groupInSlot ? nextGroup : undefined}
                    hasGroups={props.groups.length > 0}
                    wallet={wallet}
                    groupRemaining={groupRemaining}
                    serverNow={props.serverNow}
                  />
                  {lastCharge && (
                    <p className="mt-1 text-xs text-gray-600" data-testid="last-charge">
                      শেষ উত্তরের খরচ: {takaPrecise(lastCharge.charged)} · {lastCharge.source === "GROUP" ? "গ্রুপ অ্যালাওয়েন্স" : "ওয়ালেট"} বাকি {takaPrecise(lastCharge.remaining)}
                    </p>
                  )}
                  {error && <p role="alert" className="mt-1 rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-700">{error}</p>}
                  <form
                    className="mt-2 flex items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send();
                    }}
                  >
                    <textarea
                      ref={taRef}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(min-width: 768px)").matches) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                      onFocus={() => setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 300)}
                      rows={1}
                      maxLength={8000}
                      placeholder={source ? "এখানে লিখুন…" : "আগে খরচের উৎস বেছে নিন"}
                      disabled={!source}
                      className="input max-h-40 min-h-11 resize-none"
                      aria-label="বার্তা"
                    />
                    <button className="btn-primary shrink-0" disabled={busy || !text.trim() || !source || balance <= 0} aria-label="পাঠান">
                      {busy ? "…" : "পাঠান"}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function FundingBar({
  source, setSource, groupInSlot, nextGroup, hasGroups, wallet, groupRemaining, serverNow,
}: {
  source: Source | null;
  setSource: (s: Source) => void;
  groupInSlot: GroupFunding | null;
  nextGroup?: GroupFunding;
  hasGroups: boolean;
  wallet: number;
  groupRemaining: number;
  serverNow: string;
}) {
  return (
    <div className="space-y-1.5" data-testid="funding-bar">
      {hasGroups && !groupInSlot && (
        <div className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          এখন আপনার গ্রুপের সময় নয়।
          {nextGroup?.windowStart && (
            <> পরের সময় ({nextGroup.slotLabel}) শুরু: <Countdown target={nextGroup.windowStart} serverNow={serverNow} /></>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-500">খরচ হবে:</span>
        {groupInSlot && (
          <button type="button" onClick={() => setSource("GROUP")} aria-pressed={source === "GROUP"}
            className={`rounded-full px-3 py-1 font-semibold ring-1 ${source === "GROUP" ? "bg-brand-600 text-white ring-brand-600" : "ring-gray-300"}`}>
            গ্রুপ অ্যালাওয়েন্স · {takaPrecise(groupRemaining)}
          </button>
        )}
        <button type="button" onClick={() => setSource("WALLET")} aria-pressed={source === "WALLET"}
          className={`rounded-full px-3 py-1 font-semibold ring-1 ${source === "WALLET" ? "bg-brand-600 text-white ring-brand-600" : "ring-gray-300"}`}>
          {source === "WALLET" ? "ব্যক্তিগত ওয়ালেট" : "ব্যক্তিগত ওয়ালেট ব্যবহার করুন"} · {takaPrecise(wallet)}
        </button>
        {source === "WALLET" && wallet <= 0 && <Link href="/wallet" className="text-xs font-semibold text-brand-700 underline">টপ-আপ করুন</Link>}
      </div>
      {source && (
        <div className="text-xs text-gray-500" data-testid="funding-source">
          নির্বাচিত: <strong>{source === "GROUP" ? "Group allowance — গ্রুপ অ্যালাওয়েন্স" : "Personal wallet — ব্যক্তিগত ওয়ালেট"}</strong>
        </div>
      )}
    </div>
  );
}
