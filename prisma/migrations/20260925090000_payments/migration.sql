-- Payments for consumer quote requests (Ozow). Purely additive: no existing
-- row changes, and a request with no payment row reads as "never charged",
-- which is the truth for everything submitted before this.
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed');

CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ozow',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "providerPaymentId" TEXT,
    "providerTransactionId" TEXT,
    "statusReason" TEXT,
    "redirectUrl" TEXT,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payments_providerPaymentId_key" ON "payments"("providerPaymentId");
CREATE INDEX "payments_requestId_idx" ON "payments"("requestId");
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- RESTRICT: a paid request must never be deleted out from under its money.
ALTER TABLE "payments" ADD CONSTRAINT "payments_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "quote_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
