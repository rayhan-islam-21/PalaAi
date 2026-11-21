"use client";
import { useEffect, useState } from "react";

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const bn = (n: number) => new Intl.NumberFormat("bn-BD", { minimumIntegerDigits: 2 }).format(n);
  return h > 0 ? `${bn(h)} ঘণ্টা ${bn(m)} মিনিট` : `${bn(m)}:${bn(sec)}`;
}

/** Counts down to `target`; `serverNow` aligns with the server/demo clock. */
export function Countdown({ target, serverNow }: { target: string; serverNow: string }) {
  const [offset] = useState(() => new Date(serverNow).getTime() - Date.now());
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(t);
  }, [offset]);
  const left = new Date(target).getTime() - now;
  if (left <= 0) return <span>এখনই</span>;
  return <span suppressHydrationWarning>{fmt(left)}</span>;
}
