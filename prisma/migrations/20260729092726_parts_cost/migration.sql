-- Mark-up percentages on a rate card need a cost to multiply. partsAmount
-- is what the part is charged at; this is what it cost the workshop.

-- AlterTable
ALTER TABLE "quote_line_items" ADD COLUMN     "partsCost" DECIMAL(12,2);
