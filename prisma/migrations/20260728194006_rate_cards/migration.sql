-- Rate cards replace admin-configurable rate types. Every table dropped here
-- was verified empty first: no panel_beater_rates, no insurer_rates, no
-- insurers, and no custom rate types. Nothing to migrate across.

-- CreateEnum
CREATE TYPE "RateScope" AS ENUM ('in_warranty', 'out_of_warranty', 'aluminium', 'general');

-- CreateEnum
CREATE TYPE "RateCardKind" AS ENUM ('cash', 'insurance');

-- DropForeignKey
ALTER TABLE "insurer_rates" DROP CONSTRAINT "insurer_rates_insurerId_fkey";

-- DropForeignKey
ALTER TABLE "insurer_rates" DROP CONSTRAINT "insurer_rates_rateTypeId_fkey";

-- DropForeignKey
ALTER TABLE "panel_beater_rates" DROP CONSTRAINT "panel_beater_rates_panelBeaterId_fkey";

-- DropForeignKey
ALTER TABLE "panel_beater_rates" DROP CONSTRAINT "panel_beater_rates_rateTypeId_fkey";

-- AlterTable
ALTER TABLE "insurers" ADD COLUMN     "aluminium" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "quote_requests" DROP COLUMN "rateTypeId",
ADD COLUMN     "rateCardId" TEXT;

-- DropTable
DROP TABLE "insurer_rates";

-- DropTable
DROP TABLE "panel_beater_rates";

-- DropTable
DROP TABLE "rate_types";

-- CreateTable
CREATE TABLE "insurer_rate_values" (
    "insurerId" TEXT NOT NULL,
    "scope" "RateScope" NOT NULL,
    "field" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "insurer_rate_values_pkey" PRIMARY KEY ("insurerId","scope","field")
);

-- CreateTable
CREATE TABLE "rate_cards" (
    "id" TEXT NOT NULL,
    "panelBeaterId" TEXT NOT NULL,
    "kind" "RateCardKind" NOT NULL,
    "insurerId" TEXT,
    "aluminium" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_card_values" (
    "rateCardId" TEXT NOT NULL,
    "scope" "RateScope" NOT NULL,
    "field" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "rate_card_values_pkey" PRIMARY KEY ("rateCardId","scope","field")
);

-- CreateIndex
CREATE INDEX "rate_cards_panelBeaterId_idx" ON "rate_cards"("panelBeaterId");

-- CreateIndex
CREATE UNIQUE INDEX "rate_cards_panelBeaterId_insurerId_key" ON "rate_cards"("panelBeaterId", "insurerId");

-- AddForeignKey
ALTER TABLE "insurer_rate_values" ADD CONSTRAINT "insurer_rate_values_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "insurers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_panelBeaterId_fkey" FOREIGN KEY ("panelBeaterId") REFERENCES "panel_beaters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "insurers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_card_values" ADD CONSTRAINT "rate_card_values_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "rate_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "rate_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
