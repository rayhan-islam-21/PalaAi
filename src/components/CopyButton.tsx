"use client";
import { useState } from "react";

export function CopyButton({ text, label = "কপি" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary min-h-9 py-1 text-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          window.prompt("কপি করুন:", text);
        }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "কপি হয়েছে ✓" : label}
    </button>
  );
}
