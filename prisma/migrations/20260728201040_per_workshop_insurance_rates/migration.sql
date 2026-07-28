-- Insurance rates are negotiated per repairer, not set centrally: every
-- panel beater has its own SLA with each insurer. The card therefore carries
-- a free-text insurer name and its own values, and the central insurer rate
-- card is dropped. Both affected tables were empty.

-- DropForeignKey
ALTER TABLE "insurer_rate_values" DROP CONSTRAINT "insurer_rate_values_insurerId_fkey";

-- DropForeignKey
ALTER TABLE "rate_cards" DROP CONSTRAINT "rate_cards_insurerId_fkey";

-- DropIndex
DROP INDEX "rate_cards_panelBeaterId_insurerId_key";

-- AlterTable
ALTER TABLE "insurers" DROP COLUMN "aluminium";

-- AlterTable
ALTER TABLE "rate_cards" DROP COLUMN "insurerId",
ADD COLUMN     "insurerName" TEXT;

-- DropTable
DROP TABLE "insurer_rate_values";

-- CreateIndex
CREATE UNIQUE INDEX "rate_cards_panelBeaterId_insurerName_key" ON "rate_cards"("panelBeaterId", "insurerName");
