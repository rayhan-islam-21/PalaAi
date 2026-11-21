import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { isDemoMode } from "@/lib/env";
import { ActionForm } from "@/components/ActionForm";
import { groupQuote } from "@/lib/pricing";
import { takaPlain } from "@/lib/money";
import { currentTime } from "@/lib/clock";
import { saveSettingsAction, savePaymentMethodAction, setDemoClockAction, saveBusinessSettingsAction, saveSupportAction } from "../actions";
import { BusinessSettings } from "./BusinessSettings";
import { MODEL_PRICES } from "@/lib/models";
import { GROUPS_ENABLED } from "@/lib/features";

const toTaka = (p: number) => (p / 100).toFixed(2).replace(/\.00$/, "");

export default async function AdminSettings() {
  const s = await getSettings(prisma);
  const methods = await prisma.paymentMethod.findMany();
  const q4 = groupQuote(s.poolAmount, 4, s.serviceFeePerMember);
  const q5 = groupQuote(s.poolAmount, 5, s.serviceFeePerMember);
  const now = await currentTime(prisma);
  const field = (name: string, label: string, value: string | number, hint?: string, type = "text") => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input className="input" id={name} name={name} defaultValue={String(value)} type={type} step="any" required={name !== "effort"} />
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
  return (
    <div className="space-y-6">
      <h1 className="h1">Settings</h1>



      <section className="card space-y-3">
        <div>
          <h2 className="h2">Pricing & AI</h2>
          <p className="muted">Everything a customer is charged is calculated from these values.</p>
        </div>
        <BusinessSettings
          action={saveBusinessSettingsAction}
          models={MODEL_PRICES}
          initial={{
            modelId: s.modelId,
            input: s.rates.inputUsdPerMTok,
            output: s.rates.outputUsdPerMTok,
            usdToBdt: s.rates.usdToBdt,
            markup: s.walletMarkupPercent,
            packs: s.packs,
            firstBonusPercent: s.firstTopupBonusPercent,
            firstBonusCap: s.firstTopupBonusCap,
            maxOutputTokens: s.maxOutputTokens,
            minOutputTokens: s.minOutputTokens,
            effort: s.effort,
          }}
        />
      </section>
      <section className="card">
        <h2 className="h2">bKash / Nagad receiving numbers</h2>
        <p className="muted">Customers only see methods that are enabled and have a receiving number. Use your own real bKash/Nagad number.</p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {["BKASH", "NAGAD"].map((p) => {
            const m = methods.find((x) => x.provider === p);
            return (
              <div key={p} className="rounded-xl border p-3">
                <ActionForm action={savePaymentMethodAction} submitLabel={`Save ${p}`} className="space-y-2">
                  <input type="hidden" name="provider" value={p} />
                  <div className="flex items-center justify-between">
                    <strong>{p === "BKASH" ? "bKash" : "Nagad"}</strong>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={!!m?.enabled} /> Enabled</label>
                  </div>
                  {m?.isDemo && <p className="rounded bg-amber-100 p-2 text-xs">Demo placeholder number — replace before real use.</p>}
                  <input className="input" name="receiverNumber" placeholder="01XXXXXXXXX" defaultValue={m?.receiverNumber ?? ""} aria-label={`${p} receiving number`} />
                  <select className="input" name="accountType" defaultValue={m?.accountType ?? "Personal"}>
                    <option>Personal</option><option>Merchant</option><option>Agent</option>
                  </select>
                  <textarea className="input" name="instructions" rows={3} placeholder="Instructions shown to customers (Bangla)" defaultValue={m?.instructions ?? ""} />
                </ActionForm>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="h2">Support contact</h2>
          <p className="muted">Shown on the Support page, used by customers for payment problems and forgotten passwords.</p>
        </div>
        <ActionForm action={saveSupportAction} submitLabel="Save support contact" submitClass="btn-primary" className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="supportWhatsapp">WhatsApp number</label>
            <input className="input" id="supportWhatsapp" name="supportWhatsapp" defaultValue={s.supportWhatsapp} placeholder="01XXXXXXXXX" />
          </div>
          <div>
            <label className="label" htmlFor="supportEmail">Support email</label>
            <input className="input" id="supportEmail" name="supportEmail" type="email" defaultValue={s.supportEmail} placeholder="support@yourdomain.com" />
          </div>
          <div>
            <label className="label" htmlFor="businessName">Business name</label>
            <input className="input" id="businessName" name="businessName" defaultValue={s.businessName} />
          </div>
        </ActionForm>
      </section>

      {GROUPS_ENABLED && (
      <section className="card">
        <h2 className="h2">Group Pass pricing</h2>
        <p className="muted">Current quote: 4 people {takaPlain(q4.sharePerMember)} + {takaPlain(q4.feePerMember)} = {takaPlain(q4.pricePerMember)} each · 5 people {takaPlain(q5.sharePerMember)} + {takaPlain(q5.feePerMember)} = {takaPlain(q5.pricePerMember)} each. Changes apply to new groups and renewals only.</p>
        <ActionForm action={saveSettingsAction} submitLabel="Save settings" submitClass="btn-primary" className="mt-3 grid gap-3 md:grid-cols-3">
          {field("poolAmount", "Monthly usage pool (৳)", toTaka(s.poolAmount), "Sample API usage budget split equally per member")}
          {field("serviceFee", "Service fee per member (৳20–30)", toTaka(s.serviceFeePerMember))}
          {field("cycleDays", "Cycle length (days)", s.cycleDays, undefined, "number")}
          <div className="md:col-span-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="schedule4">4-person daily slots (Asia/Dhaka, one per line)</label>
              <textarea className="input font-mono" id="schedule4" name="schedule4" rows={4} defaultValue={s.schedule4.map((x) => `${x.start}-${x.end}`).join("\n")} />
            </div>
            <div>
              <label className="label" htmlFor="schedule5">5-person daily slots</label>
              <textarea className="input font-mono" id="schedule5" name="schedule5" rows={5} defaultValue={s.schedule5.map((x) => `${x.start}-${x.end}`).join("\n")} />
            </div>
            <p className="text-xs text-gray-500 md:col-span-2">Schedules are copied into each group when it is created, so editing them only affects future groups.</p>
          </div>
          {field("modelId", "Anthropic model ID", s.modelId)}
          {field("inputUsdPerMTok", "Input price (USD / 1M tokens)", s.rates.inputUsdPerMTok)}
          {field("outputUsdPerMTok", "Output price (USD / 1M tokens)", s.rates.outputUsdPerMTok)}
          {field("usdToBdt", "Exchange rate (BDT per USD)", s.rates.usdToBdt)}
          {field("walletMarkupPercent", "Wallet usage markup (%)", s.walletMarkupPercent, undefined, "number")}
          {field("groupMarkupPercent", "Group usage markup (%)", s.groupMarkupPercent, "Usually 0 — the service fee is your group revenue", "number")}
          {field("maxOutputTokens", "Max output tokens per reply", s.maxOutputTokens, undefined, "number")}
          {field("minOutputTokens", "Min affordable output tokens", s.minOutputTokens, "Below this the request is refused as insufficient funds", "number")}
          {field("effort", "Effort (low/medium/high, blank = model default)", s.effort, "Thinking tokens bill as output and count against the cap")}
          {field("topupAmounts", "Wallet top-up options (৳, comma separated)", s.topupAmounts.map(toTaka).join(", "))}
        </ActionForm>
      </section>
      )}

      {isDemoMode() && (
        <section className="card bg-amber-50">
          <h2 className="h2">Demo clock (demo mode only)</h2>
          <p className="muted">Current business time: {now.toISOString()} (UTC). Set a Dhaka time to test slots; leave empty for real time.</p>
          <ActionForm action={setDemoClockAction} submitLabel="Set simulated time" submitClass="btn-secondary" className="mt-2 flex flex-wrap items-end gap-2">
            <input className="input w-auto" type="datetime-local" name="demoNow" aria-label="Simulated Dhaka time" />
          </ActionForm>
        </section>
      )}
    </div>
  );
}
