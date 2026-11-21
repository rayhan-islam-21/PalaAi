// Production-safe seed: creates the settings row with defaults. No payment methods, no users.
import { PrismaClient } from "@prisma/client";
import { getSettings } from "../src/lib/settings";

const db = new PrismaClient();
getSettings(db)
  .then((s) => console.log("Settings ready:", { poolAmount: s.poolAmount, fee: s.serviceFeePerMember, model: s.modelId }))
  .finally(() => db.$disconnect());
