const MAP: Record<string, [string, string]> = {
  PENDING: ["যাচাই চলছে", "bg-amber-100 text-amber-800"],
  APPROVED: ["অনুমোদিত", "bg-brand-100 text-brand-900"],
  REJECTED: ["বাতিল", "bg-red-100 text-red-700"],
  UNPAID: ["টাকা বাকি", "bg-gray-100 text-gray-700"],
  PAID: ["পরিশোধিত", "bg-brand-100 text-brand-900"],
  VOID: ["প্রযোজ্য নয়", "bg-gray-100 text-gray-500"],
  REFUND_DUE: ["ফেরত বাকি", "bg-orange-100 text-orange-800"],
  REFUNDED: ["ফেরত দেওয়া হয়েছে", "bg-sky-100 text-sky-800"],
  COMPLETED: ["সম্পন্ন", "bg-brand-100 text-brand-900"],
  FORMING: ["সদস্য ও পেমেন্ট বাকি", "bg-amber-100 text-amber-800"],
  ACTIVE: ["চালু", "bg-brand-100 text-brand-900"],
  EXPIRED: ["মেয়াদ শেষ", "bg-gray-200 text-gray-700"],
  CANCELLED: ["বাতিল", "bg-red-100 text-red-700"],
};

export function StatusBadge({ status }: { status: string }) {
  const [label, cls] = MAP[status] ?? [status, "bg-gray-100 text-gray-700"];
  return <span className={`badge ${cls}`}>{label}</span>;
}
