// Simple stroke icons (decorative; pass aria-hidden by default).
type P = { size?: number; className?: string; stroke?: string };
const base = (size: number, className?: string, stroke = "currentColor") => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: 2,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className, "aria-hidden": true,
});

export const LogoMark = ({ size = 34 }: { size?: number }) => (
  <span className="flex items-center justify-center rounded-[10px] bg-brand-600" style={{ width: size, height: size }}>
    <svg {...base(size * 0.56, undefined, "#fff")} strokeWidth={2.2}><path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6" /><circle cx="12" cy="12" r="2.5" /></svg>
  </span>
);
export const IconUsers = ({ size = 20, className, stroke }: P) => (<svg {...base(size, className, stroke)}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9" r="2.4" /><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5" /></svg>);
export const IconWallet = ({ size = 20, className, stroke }: P) => (<svg {...base(size, className, stroke)}><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10h18" /><path d="M16 14.5h2" /></svg>);
export const IconPhone = ({ size = 20, className, stroke }: P) => (<svg {...base(size, className, stroke)}><rect x="5" y="2.5" width="14" height="19" rx="2.5" /><path d="M10 18h4" /></svg>);
export const IconLock = ({ size = 20, className, stroke }: P) => (<svg {...base(size, className, stroke)}><rect x="4" y="10.5" width="16" height="10" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg>);
export const IconRefund = ({ size = 20, className, stroke }: P) => (<svg {...base(size, className, stroke)}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v4h4" /></svg>);
export const IconCheck = ({ size = 16, className, stroke }: P) => (<svg {...base(size, className, stroke)} strokeWidth={2.4}><path d="M20 6 9 17l-5-5" /></svg>);
export const IconShield = ({ size = 22, className, stroke }: P) => (<svg {...base(size, className, stroke)}><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3Z" /></svg>);
export const IconChart = ({ size = 22, className, stroke }: P) => (<svg {...base(size, className, stroke)}><path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6" /></svg>);
export const IconClock = ({ size = 22, className, stroke }: P) => (<svg {...base(size, className, stroke)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
export const IconLang = ({ size = 22, className, stroke }: P) => (<svg {...base(size, className, stroke)}><path d="M4 5h9M8.5 3v2M6 5c0 4 3 7 6 8M11 5c-.5 3.5-3 7-6 8" /><path d="m13 21 4-9 4 9M14.5 18h5" /></svg>);
export const IconChat = ({ size = 22, className, stroke }: P) => (<svg {...base(size, className, stroke)}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /></svg>);
export const IconHome = ({ size = 22, className, stroke }: P) => (<svg {...base(size, className, stroke)}><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></svg>);
