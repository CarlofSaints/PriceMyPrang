-- Additive. Existing quotes keep outWorkTotal 0 and a NULL sundriesPercent,
-- which reads correctly as "sundries were entered as a rand amount".
ALTER TABLE "quotes" ADD COLUMN "outWorkTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "quotes" ADD COLUMN "sundriesPercent" DECIMAL(6,2);
