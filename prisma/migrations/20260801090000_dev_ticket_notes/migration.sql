-- CreateTable
CREATE TABLE "dev_ticket_notes" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dev_ticket_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dev_ticket_notes_ticketId_idx" ON "dev_ticket_notes"("ticketId");

-- AddForeignKey
ALTER TABLE "dev_ticket_notes" ADD CONSTRAINT "dev_ticket_notes_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "dev_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
