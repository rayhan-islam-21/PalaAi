-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "firstTopupBonusCap" INTEGER NOT NULL DEFAULT 10000,
ADD COLUMN     "firstTopupBonusPercent" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "packs" JSONB;
