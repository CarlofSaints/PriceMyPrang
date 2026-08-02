-- Where a part was sourced. `supplier` (the name) already existed from the old
-- parts catalogue and is kept as a verbatim copy, so provenance survives the
-- supplier later being removed from the workshop's book.
ALTER TABLE "quote_line_items" ADD COLUMN "supplierId" TEXT;

-- CreateIndex
CREATE INDEX "quote_line_items_supplierId_idx" ON "quote_line_items"("supplierId");

-- SetNull, not Cascade: deleting a supplier must never delete quote lines.
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
