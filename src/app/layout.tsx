import type { Metadata, Viewport } from "next";
import "./globals.css";
import { isDemoMode } from "@/lib/env";

export const metadata: Metadata = {
  title: "Pala AI — বন্ধুরা মিলে AI",
  description: "বন্ধুদের সাথে মাসিক AI বাজেট ভাগ করুন, অথবা নিজের জন্য প্রিপেইড ক্রেডিট নিন। বিকাশ/নগদে পেমেন্ট।",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
  themeColor: "#047857",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        {isDemoMode() && (
          <div className="bg-amber-400 px-3 py-1 text-center text-xs font-semibold text-amber-950">
            ডেমো মোড — মক AI ও টেস্ট ডেটা। আসল গ্রাহকের জন্য নয়।
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
