-- Custom rates, defined once per workshop and priced per rate card.
--
-- Values are NOT stored here. They go in rate_card_values under scope
-- 'general' with field 'custom:<id>', alongside every other rate, so Power BI
-- keeps reading one table.
CREATE TABLE "custom_rate_types" (
    "id" TEXT NOT NULL,
    "panelBeaterId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" "RateUnit" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_rate_types_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "custom_rate_types_panelBeaterId_idx" ON "custom_rate_types"("panelBeaterId");

-- One name per workshop. Case-insensitivity is enforced in code.
CREATE UNIQUE INDEX "custom_rate_types_panelBeaterId_label_key"
    ON "custom_rate_types"("panelBeaterId", "label");

ALTER TABLE "custom_rate_types"
    ADD CONSTRAINT "custom_rate_types_panelBeaterId_fkey"
    FOREIGN KEY ("panelBeaterId") REFERENCES "panel_beaters"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Retire two general rates the client dropped: "Mechanical / suspension" and
-- "Cut & weld". Both are now covered by workshop-defined custom rates.
--
-- The app already ignores off-catalogue fields on read, so these rows are
-- invisible the moment the catalogue changes — but Power BI reads this table
-- directly and would keep reporting them. Deleting is safe for history:
-- quote lines store their own amounts, never a link back to a rate card.
DELETE FROM "rate_card_values"
    WHERE "scope" = 'general'
      AND "field" IN ('mechanical_suspension', 'cut_and_weld');
