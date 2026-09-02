-- Where the vehicle is, for triage. Additive and nullable: every existing row
-- predates the question, and "we never asked" is not the same as "no town".
ALTER TABLE "quote_requests" ADD COLUMN "town" TEXT;
ALTER TABLE "quote_requests" ADD COLUMN "province" TEXT;

-- Straight-line km to the nearest active repairer at the moment of submission.
ALTER TABLE "quote_requests" ADD COLUMN "nearestPanelBeaterKm" DOUBLE PRECISION;

CREATE INDEX "quote_requests_province_idx" ON "quote_requests"("province");
