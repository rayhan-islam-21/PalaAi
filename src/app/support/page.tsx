import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const s = await getSettings(prisma);
  const wa = s.supportWhatsapp.replace(/[^0-9]/g, "");
  const waIntl = wa.startsWith("0") ? `88${wa}` : wa;
  return (
    <AppShell footer>
      <h1 className="h1">সাপোর্ট</h1>
      <p className="muted mt-1">পেমেন্ট, পাসওয়ার্ড বা অন্য যেকোনো সমস্যায় আমাদের জানান।</p>
      <div className="mt-4 space-y-3">
        {wa && (
          <a href={`https://wa.me/${waIntl}`} target="_blank" rel="noreferrer" className="card flex items-center justify-between">
            <span><strong>WhatsApp</strong><span className="block text-sm text-mute">{s.supportWhatsapp}</span></span>
            <span className="btn-primary min-h-10 py-1.5 text-sm">মেসেজ দিন</span>
          </a>
        )}
        {s.supportEmail && (
          <a href={`mailto:${s.supportEmail}`} className="card flex items-center justify-between">
            <span><strong>ইমেইল</strong><span className="block text-sm text-mute">{s.supportEmail}</span></span>
            <span className="btn-secondary min-h-10 py-1.5 text-sm">ইমেইল করুন</span>
          </a>
        )}
        {!wa && !s.supportEmail && <div className="card text-sm text-mute">সাপোর্টের যোগাযোগের তথ্য শিগগিরই যোগ করা হবে।</div>}
      </div>
      <div className="card mt-4 space-y-2 text-[15px]">
        <h2 className="h2">যোগাযোগের সময় যা জানাবেন</h2>
        <ul className="list-disc space-y-1 pl-5 text-mute">
          <li>অ্যাকাউন্টের ইমেইল</li>
          <li>পেমেন্টের সমস্যা হলে: TrxID, টাকার পরিমাণ ও যে নম্বর থেকে পাঠিয়েছেন</li>
          <li>পাসওয়ার্ড ভুলে গেলে: অ্যাকাউন্টের ইমেইল ও আপনার নাম — আমরা যাচাই করে নতুন অস্থায়ী পাসওয়ার্ড দেব</li>
        </ul>
      </div>
    </AppShell>
  );
}
