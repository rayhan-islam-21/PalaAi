-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "businessName" TEXT NOT NULL DEFAULT 'Pala AI',
ADD COLUMN     "supportEmail" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "supportWhatsapp" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "disabled" BOOLEAN NOT NULL DEFAULT false;
