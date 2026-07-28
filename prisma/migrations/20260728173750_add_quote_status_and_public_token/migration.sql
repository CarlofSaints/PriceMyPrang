-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('awaiting_approval', 'accepted', 'declined');

-- AlterTable
ALTER TABLE "quote_requests" ADD COLUMN     "publicToken" TEXT;

-- Existing requests predate the consumer quote page. Give them a token too, so
-- a link can be sent for work that is already in flight.
UPDATE "quote_requests" SET "publicToken" = gen_random_uuid()::text WHERE "publicToken" IS NULL;

-- AlterTable
-- Quotes already in the table were submitted but never accepted or declined,
-- which is exactly what awaiting_approval means.
ALTER TABLE "quotes" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "status" "QuoteStatus" NOT NULL DEFAULT 'awaiting_approval';

-- CreateIndex
CREATE UNIQUE INDEX "quote_requests_publicToken_key" ON "quote_requests"("publicToken");
