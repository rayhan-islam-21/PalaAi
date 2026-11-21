// DEMO ONLY. Seeds test users and a clearly-labelled placeholder payment method.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { getSettings } from "../src/lib/settings";
import { upsertPasswordUser } from "../scripts/users";

if (process.env.PALA_DEMO_MODE !== "true" || process.env.VERCEL_ENV === "production") {
  console.error("Refusing to seed demo data: set PALA_DEMO_MODE=true in a non-production environment.");
  process.exit(1);
}

const db = new PrismaClient();
const PASSWORD = "demo12345";

async function main() {
  await getSettings(db);
  // Recommended business settings: Sonnet 5.5, ৳130/$, 33% markup (= 25% profit).
  await db.setting.update({ where: { id: 1 }, data: { modelId: "claude-sonnet-5-5", inputUsdPerMTok: 2, outputUsdPerMTok: 10, usdToBdt: 130, walletMarkupPercent: 33 } });
  await upsertPasswordUser(db, { email: "admin@pala.test", password: PASSWORD, name: "Admin", role: "ADMIN" });
  const names = ["রাফি", "নুসরাত", "তানভীর", "সাদিয়া", "আরিফ", "মিম"];
  for (let i = 0; i < names.length; i++) {
    await upsertPasswordUser(db, { email: `demo${i + 1}@pala.test`, password: PASSWORD, name: names[i] });
  }
  // 010 is not an allocated Bangladeshi mobile prefix: this cannot receive real money.
  await db.paymentMethod.upsert({
    where: { provider: "BKASH" },
    update: {},
    create: {
      provider: "BKASH",
      enabled: true,
      receiverNumber: "01000000000",
      accountType: "Personal",
      isDemo: true,
      instructions: "ডেমো: আসল টাকা পাঠাবেন না। যেকোনো নমুনা TrxID (যেমন DEMO123456) দিয়ে জমা দিন, তারপর অ্যাডমিন হিসেবে অনুমোদন দিন।",
    },
  });
  console.log(`Demo data ready. Admin: admin@pala.test / ${PASSWORD}; users demo1..demo6@pala.test / ${PASSWORD}`);
}

main().finally(() => db.$disconnect());
