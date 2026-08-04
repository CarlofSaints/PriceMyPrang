-- Insurer contacts + additionals raised after stripping a vehicle.

CREATE TYPE "AdditionalStatus" AS ENUM ('pending', 'approved', 'declined');

-- ---------------------------------------------------------------------------
-- Someone to talk to at an insurer.
--
-- panelBeaterId NULL = generic contact, added by PMP staff, seen by everyone.
-- panelBeaterId set  = private to that workshop and invisible to the others.
-- ---------------------------------------------------------------------------
CREATE TABLE "insurer_contacts" (
    "id" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "panelBeaterId" TEXT,
    "name" TEXT,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurer_contacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "insurer_contacts_insurerId_idx" ON "insurer_contacts"("insurerId");
CREATE INDEX "insurer_contacts_panelBeaterId_idx" ON "insurer_contacts"("panelBeaterId");

ALTER TABLE "insurer_contacts"
    ADD CONSTRAINT "insurer_contacts_insurerId_fkey"
    FOREIGN KEY ("insurerId") REFERENCES "insurers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "insurer_contacts"
    ADD CONSTRAINT "insurer_contacts_panelBeaterId_fkey"
    FOREIGN KEY ("panelBeaterId") REFERENCES "panel_beaters"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Extra work found after stripping. A separate document from the accepted
-- quote on purpose — the customer agreed to a number, and this asks for more.
-- ---------------------------------------------------------------------------
CREATE TABLE "additionals" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "panelBeaterId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 1,
    "status" "AdditionalStatus" NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "partsTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "outWorkTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "panelTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paintTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stripTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "labourTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "claimNumber" TEXT,
    "contactId" TEXT,
    "sentToEmail" TEXT,
    "sentToName" TEXT,
    "sentAt" TIMESTAMP(3),
    "clientEmail" TEXT,
    "clientSentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "responseNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByName" TEXT,

    CONSTRAINT "additionals_pkey" PRIMARY KEY ("id")
);

-- "Additionals #1", "#2" per workshop per job. Stripping reveals more than
-- once, and the insurer must be able to tell two requests apart.
CREATE UNIQUE INDEX "additionals_requestId_panelBeaterId_seq_key"
    ON "additionals"("requestId", "panelBeaterId", "seq");
CREATE INDEX "additionals_panelBeaterId_status_idx" ON "additionals"("panelBeaterId", "status");
CREATE INDEX "additionals_requestId_idx" ON "additionals"("requestId");

ALTER TABLE "additionals"
    ADD CONSTRAINT "additionals_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "quote_requests"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "additionals"
    ADD CONSTRAINT "additionals_panelBeaterId_fkey"
    FOREIGN KEY ("panelBeaterId") REFERENCES "panel_beaters"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- The contact may later be deleted; the request keeps its own copy of the
-- address and name it was actually sent to, so the link going null loses
-- nothing that matters.
ALTER TABLE "additionals"
    ADD CONSTRAINT "additionals_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "insurer_contacts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- One line of extra work. Same shape as a quote line, so it prices off the
-- job's rate card exactly like everything else.
-- ---------------------------------------------------------------------------
CREATE TABLE "additional_lines" (
    "id" TEXT NOT NULL,
    "additionalId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "code" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "partsCost" DECIMAL(12,2),
    "partsAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "supplierId" TEXT,
    "supplier" TEXT,
    "panelCode" TEXT,
    "panelAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "panelHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paintCode" TEXT,
    "paintAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paintHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "stripCode" TEXT,
    "stripAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stripHours" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "additional_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "additional_lines_additionalId_sortOrder_idx"
    ON "additional_lines"("additionalId", "sortOrder");
CREATE INDEX "additional_lines_supplierId_idx" ON "additional_lines"("supplierId");

ALTER TABLE "additional_lines"
    ADD CONSTRAINT "additional_lines_additionalId_fkey"
    FOREIGN KEY ("additionalId") REFERENCES "additionals"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "additional_lines"
    ADD CONSTRAINT "additional_lines_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
