-- Discount vouchers for the customer's request fee (lib/vouchers.ts, /portal/admin/vouchers).
-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "voucherCode" TEXT,
ADD COLUMN     "voucherId" TEXT,
ADD COLUMN     "voucherPercentOff" INTEGER;

-- AlterTable
ALTER TABLE "quote_requests" ADD COLUMN     "voucherId" TEXT;

-- CreateTable
CREATE TABLE "vouchers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "percentOff" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxUses" INTEGER NOT NULL,
    "usesCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_code_key" ON "vouchers"("code");

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The rules the app enforces, held by the database too.
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_percent_off_range" CHECK ("percentOff" BETWEEN 1 AND 100);
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_max_uses_positive" CHECK ("maxUses" >= 1);
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_uses_count_non_negative" CHECK ("usesCount" >= 0);

-- Default deny, like every other table (20261010090000): the app connects as
-- the owner, which bypasses RLS. No policy, no grant.
ALTER TABLE "vouchers" ENABLE ROW LEVEL SECURITY;
