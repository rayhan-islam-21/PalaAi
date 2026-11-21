/** Money helpers. All amounts are integer poisha (1 BDT = 100 poisha). */

const bn = new Intl.NumberFormat("bn-BD", { maximumFractionDigits: 2, minimumFractionDigits: 0 });

export function taka(poisha: number): string {
  const v = poisha / 100;
  return `৳${bn.format(v)}`;
}

/** Fixed two-decimal display for small amounts like per-message charges. */
export function takaPrecise(poisha: number): string {
  const f = new Intl.NumberFormat("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `৳${f.format(poisha / 100)}`;
}

/** Plain ASCII form for admin tables / CSV. */
export function takaPlain(poisha: number): string {
  return `৳${(poisha / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function bnNum(n: number): string {
  return new Intl.NumberFormat("bn-BD").format(n);
}

/** Parse "625" / "625.50" taka into poisha. Returns null on invalid input. */
export function parseTaka(input: string): number | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return parseInt(whole, 10) * 100 + parseInt((frac + "00").slice(0, 2), 10);
}
