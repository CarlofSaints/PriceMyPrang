-- Suppliers become scoped. Existing rows keep a NULL panelBeaterId, which is
-- exactly right: they are Price my Prang's own list.
ALTER TABLE "suppliers" ADD COLUMN "panelBeaterId" TEXT;

ALTER TABLE "suppliers" ADD COLUMN "companyRegNumber" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "vatNumber" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "address" TEXT;

ALTER TABLE "suppliers" ADD COLUMN "mainContactName" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "mainContactPhone" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "mainContactEmail" TEXT;

ALTER TABLE "suppliers" ADD COLUMN "billingContactName" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "billingContactPhone" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "billingContactEmail" TEXT;

-- CreateIndex
CREATE INDEX "suppliers_panelBeaterId_idx" ON "suppliers"("panelBeaterId");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_panelBeaterId_fkey" FOREIGN KEY ("panelBeaterId") REFERENCES "panel_beaters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grant the new permissions to the existing seeded panel-beater roles. Roles
-- are DATA, so changing DEFAULT_ROLES alone would only affect a fresh seed and
-- would leave every live workshop unable to reach the new page.
--
-- This is also the first real difference between Estimator and Buyer, which
-- until now differed in name only: sourcing parts is the buyer's job, so the
-- buyer maintains the supplier book and the estimator reads it.
UPDATE "roles"
SET "permissions" = array_append("permissions", 'manage_own_suppliers')
WHERE "id" IN ('pb_admin', 'pb_buyer')
  AND NOT ('manage_own_suppliers' = ANY("permissions"));

UPDATE "roles"
SET "permissions" = array_append("permissions", 'view_own_suppliers')
WHERE "id" = 'pb_estimator'
  AND NOT ('view_own_suppliers' = ANY("permissions"));
