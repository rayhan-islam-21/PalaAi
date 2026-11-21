import type { AppSettings } from "./settings";
import { customerCharge } from "./pricing";

/** Example request sizes (tokens) used to show customers typical charges. Bangla answers are token-heavy. */
export const EXAMPLES = [
  { key: "short", label: "ছোট প্রশ্ন-উত্তর", hint: "যেমন: “Python-এ list কী?”", input: 300, output: 200 },
  { key: "medium", label: "ইমেইল / দরখাস্ত / অনুবাদ", hint: "যেমন: “ছুটির দরখাস্ত লিখে দাও”", input: 500, output: 700 },
  { key: "long", label: "লম্বা লেখা / কোড / বড় চ্যাট", hint: "যেমন: রচনা, CV, কোড ঠিক করা", input: 3000, output: 1500 },
] as const;

export function exampleCharges(s: AppSettings) {
  return EXAMPLES.map((e) => ({ ...e, charge: customerCharge(s.rates, s.walletMarkupPercent, e.input, e.output) }));
}

/** Approximate number of typical (medium) messages a top-up buys. */
export function approxMessages(s: AppSettings, amount: number) {
  const per = customerCharge(s.rates, s.walletMarkupPercent, EXAMPLES[1].input, EXAMPLES[1].output);
  return Math.max(1, Math.floor(amount / Math.max(1, per)));
}
