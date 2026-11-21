import type { Db, Tx } from "./db";
import { DEFAULT_SCHEDULE_4, DEFAULT_SCHEDULE_5, type Slot } from "./slots";
import type { Rates } from "./pricing";
import { normalizePacks, type Pack } from "./packs";

export type AppSettings = {
  poolAmount: number;
  serviceFeePerMember: number;
  cycleDays: number;
  schedule4: Slot[];
  schedule5: Slot[];
  modelId: string;
  rates: Rates;
  walletMarkupPercent: number;
  groupMarkupPercent: number;
  maxOutputTokens: number;
  minOutputTokens: number;
  effort: string;
  topupAmounts: number[];
  packs: Pack[];
  firstTopupBonusPercent: number;
  firstTopupBonusCap: number;
  demoNow: Date | null;
  supportEmail: string;
  supportWhatsapp: string;
  businessName: string;
};

export const FEE_MIN = 2000;
export const FEE_MAX = 3000;

export async function getSettings(db: Db | Tx): Promise<AppSettings> {
  let s = await db.setting.findUnique({ where: { id: 1 } });
  if (!s) {
    s = await db.setting.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        schedule4: DEFAULT_SCHEDULE_4,
        schedule5: DEFAULT_SCHEDULE_5,
        topupAmounts: [10000, 25000, 50000],
      },
    });
  }
  return {
    poolAmount: s.poolAmount,
    serviceFeePerMember: s.serviceFeePerMember,
    cycleDays: s.cycleDays,
    schedule4: s.schedule4 as Slot[],
    schedule5: s.schedule5 as Slot[],
    modelId: s.modelId,
    rates: {
      inputUsdPerMTok: Number(s.inputUsdPerMTok),
      outputUsdPerMTok: Number(s.outputUsdPerMTok),
      usdToBdt: Number(s.usdToBdt),
    },
    walletMarkupPercent: s.walletMarkupPercent,
    groupMarkupPercent: s.groupMarkupPercent,
    maxOutputTokens: s.maxOutputTokens,
    minOutputTokens: s.minOutputTokens,
    effort: s.effort,
    ...(() => {
      const packs = normalizePacks(s.packs, s.topupAmounts as number[]);
      return { packs, topupAmounts: packs.map((p) => p.amount) };
    })(),
    firstTopupBonusPercent: s.firstTopupBonusPercent,
    firstTopupBonusCap: s.firstTopupBonusCap,
    demoNow: s.demoNow,
    supportEmail: s.supportEmail,
    supportWhatsapp: s.supportWhatsapp,
    businessName: s.businessName,
  };
}
