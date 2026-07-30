-- CreateEnum
CREATE TYPE "DevPriority" AS ENUM ('urgent', 'must_do', 'nice_to_have');

-- CreateEnum
CREATE TYPE "DevTicketStatus" AS ENUM ('backlog', 'in_progress', 'done');

-- CreateTable
CREATE TABLE "dev_tickets" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "priority" "DevPriority" NOT NULL DEFAULT 'must_do',
    "status" "DevTicketStatus" NOT NULL DEFAULT 'backlog',
    "remindOn" DATE,
    "reminderSentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "dev_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dev_ticket_attachments" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "contentType" TEXT,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dev_ticket_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dev_tickets_status_priority_idx" ON "dev_tickets"("status", "priority");

-- CreateIndex
CREATE INDEX "dev_tickets_remindOn_idx" ON "dev_tickets"("remindOn");

-- CreateIndex
CREATE INDEX "dev_ticket_attachments_ticketId_idx" ON "dev_ticket_attachments"("ticketId");

-- AddForeignKey
ALTER TABLE "dev_ticket_attachments" ADD CONSTRAINT "dev_ticket_attachments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "dev_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
