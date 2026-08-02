-- CreateEnum
CREATE TYPE "ComplaintCategory" AS ENUM ('workmanship', 'paint', 'parts', 'delays', 'billing', 'conduct', 'other');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('new', 'acknowledged', 'with_repairer', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "VehicleSafety" AS ENUM ('safe', 'unsafe', 'unsure');

-- CreateEnum
CREATE TYPE "ComplaintOutcome" AS ENUM ('rework', 'refund', 'explanation', 'other');

-- CreateTable
CREATE TABLE "consumer_access_links" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "sentToEmail" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumer_access_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consumer_access_links_token_key" ON "consumer_access_links"("token");
CREATE INDEX "consumer_access_links_requestId_idx" ON "consumer_access_links"("requestId");
CREATE INDEX "consumer_access_links_expiresAt_idx" ON "consumer_access_links"("expiresAt");

-- CreateTable
CREATE TABLE "ratings" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "panelBeaterId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "hiddenByName" TEXT,
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ratings_requestId_panelBeaterId_key" ON "ratings"("requestId", "panelBeaterId");
CREATE INDEX "ratings_panelBeaterId_idx" ON "ratings"("panelBeaterId");

-- CreateTable
CREATE TABLE "complaints" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "panelBeaterId" TEXT NOT NULL,
    "category" "ComplaintCategory" NOT NULL DEFAULT 'other',
    "description" TEXT NOT NULL,
    "vehicleSafety" "VehicleSafety",
    "collectedOn" DATE,
    "problemNoticedOn" DATE,
    "stillWithRepairer" BOOLEAN,
    "desiredOutcome" "ComplaintOutcome",
    "raisedWithRepairer" BOOLEAN,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'new',
    "resolvedAt" TIMESTAMP(3),
    "submittedIp" TEXT,
    "submittedUserAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "complaints_status_idx" ON "complaints"("status");
CREATE INDEX "complaints_panelBeaterId_idx" ON "complaints"("panelBeaterId");
CREATE INDEX "complaints_createdAt_idx" ON "complaints"("createdAt" DESC);

-- CreateTable
CREATE TABLE "complaint_media" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "contentType" TEXT,
    "isVideo" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "complaint_media_complaintId_idx" ON "complaint_media"("complaintId");

-- CreateTable
CREATE TABLE "complaint_notes" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "complaint_notes_complaintId_idx" ON "complaint_notes"("complaintId");

-- AddForeignKey
ALTER TABLE "consumer_access_links" ADD CONSTRAINT "consumer_access_links_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "quote_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "quote_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_panelBeaterId_fkey" FOREIGN KEY ("panelBeaterId") REFERENCES "panel_beaters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "quote_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_panelBeaterId_fkey" FOREIGN KEY ("panelBeaterId") REFERENCES "panel_beaters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "complaint_media" ADD CONSTRAINT "complaint_media_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "complaint_notes" ADD CONSTRAINT "complaint_notes_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
