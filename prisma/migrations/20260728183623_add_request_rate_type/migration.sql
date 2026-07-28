-- AlterTable
-- Which of the repairer's own rate types this job is priced against. Nullable:
-- consumer-submitted jobs have no repairer at the point of creation.
ALTER TABLE "quote_requests" ADD COLUMN     "rateTypeId" TEXT;
