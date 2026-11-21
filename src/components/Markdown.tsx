"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CopyButton } from "./CopyButton";

/** Safe Markdown: raw HTML is not rendered, unsafe URLs are stripped by react-markdown's default urlTransform. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>
          ),
          pre: ({ children }) => {
            const child = Array.isArray(children) ? children[0] : children;
            const code = extractText(child);
            return (
              <div className="my-2 overflow-hidden rounded-xl bg-gray-900 text-gray-100">
                <div className="flex items-center justify-end bg-gray-800 px-2 py-1">
                  <CopyButton text={code} label="কোড কপি" />
                </div>
                <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed">{children}</pre>
              </div>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function extractText(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in (node as object)) {
    return extractText((node as { props: { children?: unknown } }).props.children);
  }
  return "";
}
