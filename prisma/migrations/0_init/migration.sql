-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RateUnit" AS ENUM ('rand_per_hour', 'rand', 'percent');

-- CreateEnum
CREATE TYPE "PartType" AS ENUM ('new', 'used', 'alternate');

-- CreateEnum
CREATE TYPE "PanelBeaterStatus" AS ENUM ('pending', 'approved', 'declined');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('new', 'in_progress', 'completed');

-- CreateEnum
CREATE TYPE "YesNo" AS ENUM ('yes', 'no');

-- CreateEnum
CREATE TYPE "YesNoUnsure" AS ENUM ('yes', 'no', 'unsure');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('disc', 'odometer', 'video', 'photo_front', 'photo_back', 'photo_left', 'photo_right', 'damage');

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[],
    "system" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "roleId" TEXT NOT NULL,
    "panelBeaterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_types" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" "RateUnit" NOT NULL,
    "group" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurer_rates" (
    "insurerId" TEXT NOT NULL,
    "rateTypeId" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "insurer_rates_pkey" PRIMARY KEY ("insurerId","rateTypeId")
);

-- CreateTable
CREATE TABLE "panel_beaters" (
    "id" TEXT NOT NULL,
    "completedByName" TEXT,
    "completedByEmail" TEXT,
    "ownerName" TEXT,
    "ownerEmail" TEXT,
    "companyName" TEXT NOT NULL,
    "tradingAs" TEXT,
    "companyRegNumber" TEXT NOT NULL,
    "vatNumber" TEXT,
    "physicalAddress" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "mibcoNumber" TEXT,
    "rmiNumber" TEXT NOT NULL,
    "sambraNumber" TEXT,
    "miwaNumber" TEXT,
    "labourRateSenior" DECIMAL(12,2),
    "labourRateJunior" DECIMAL(12,2),
    "logoUrl" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" "PanelBeaterStatus" NOT NULL DEFAULT 'pending',
    "submittedByPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "panel_beaters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "panel_beater_rates" (
    "panelBeaterId" TEXT NOT NULL,
    "rateTypeId" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "panel_beater_rates_pkey" PRIMARY KEY ("panelBeaterId","rateTypeId")
);

-- CreateTable
CREATE TABLE "warranties" (
    "id" TEXT NOT NULL,
    "panelBeaterId" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "startDate" DATE,
    "expiryDate" DATE,
    "certificateUrl" TEXT,
    "certificatePathname" TEXT,
    "certificateContentType" TEXT,
    "remind" BOOLEAN NOT NULL DEFAULT false,
    "remindersSent" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warranties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "partTypes" "PartType"[],
    "makes" TEXT[],
    "supplies" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_requests" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'new',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "companyName" TEXT,
    "hasInsurance" "YesNo" NOT NULL,
    "insurerName" TEXT,
    "insurerId" TEXT,
    "underWarranty" "YesNoUnsure" NOT NULL,
    "isInsuranceClaim" "YesNo" NOT NULL,
    "claimNumber" TEXT,
    "noClaimNumberYet" BOOLEAN NOT NULL DEFAULT false,
    "isThirdPartyClaim" "YesNo" NOT NULL,
    "suspectedEngineDamage" "YesNo" NOT NULL,
    "quotesRequested" INTEGER NOT NULL DEFAULT 1,
    "vin" TEXT,
    "make" TEXT,
    "model" TEXT,
    "series" TEXT,
    "year" TEXT,
    "colour" TEXT,
    "registration" TEXT,
    "discRawText" TEXT,
    "mileageKm" INTEGER,
    "repairerInitiated" BOOLEAN NOT NULL DEFAULT false,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "letUsChoose" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_media" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "url" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "contentType" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_panel_beaters" (
    "requestId" TEXT NOT NULL,
    "panelBeaterId" TEXT NOT NULL,

    CONSTRAINT "request_panel_beaters_pkey" PRIMARY KEY ("requestId","panelBeaterId")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "panelBeaterId" TEXT NOT NULL,
    "sundries" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "consumables" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "partsTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "panelTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paintTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stripTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "labourTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "estimatorName" TEXT,
    "pdfUrl" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_line_items" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "code" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "partsAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "partId" TEXT,
    "supplier" TEXT,
    "partNumber" TEXT,
    "panelCode" TEXT,
    "panelAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "panelHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paintCode" TEXT,
    "paintAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paintHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "stripCode" TEXT,
    "stripAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stripHours" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "quote_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_counters" (
    "dateKey" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reference_counters_pkey" PRIMARY KEY ("dateKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_roleId_idx" ON "users"("roleId");

-- CreateIndex
CREATE INDEX "users_panelBeaterId_idx" ON "users"("panelBeaterId");

-- CreateIndex
CREATE INDEX "rate_types_active_order_idx" ON "rate_types"("active", "order");

-- CreateIndex
CREATE INDEX "insurer_rates_rateTypeId_idx" ON "insurer_rates"("rateTypeId");

-- CreateIndex
CREATE INDEX "panel_beaters_active_status_idx" ON "panel_beaters"("active", "status");

-- CreateIndex
CREATE INDEX "panel_beaters_companyName_idx" ON "panel_beaters"("companyName");

-- CreateIndex
CREATE INDEX "panel_beater_rates_rateTypeId_idx" ON "panel_beater_rates"("rateTypeId");

-- CreateIndex
CREATE INDEX "warranties_panelBeaterId_idx" ON "warranties"("panelBeaterId");

-- CreateIndex
CREATE INDEX "warranties_expiryDate_idx" ON "warranties"("expiryDate");

-- CreateIndex
CREATE INDEX "suppliers_active_idx" ON "suppliers"("active");

-- CreateIndex
CREATE UNIQUE INDEX "quote_requests_reference_key" ON "quote_requests"("reference");

-- CreateIndex
CREATE INDEX "quote_requests_status_idx" ON "quote_requests"("status");

-- CreateIndex
CREATE INDEX "quote_requests_createdAt_idx" ON "quote_requests"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "quote_requests_insurerId_idx" ON "quote_requests"("insurerId");

-- CreateIndex
CREATE INDEX "quote_requests_email_idx" ON "quote_requests"("email");

-- CreateIndex
CREATE INDEX "quote_requests_lastName_idx" ON "quote_requests"("lastName");

-- CreateIndex
CREATE INDEX "request_media_requestId_kind_idx" ON "request_media"("requestId", "kind");

-- CreateIndex
CREATE INDEX "request_panel_beaters_panelBeaterId_idx" ON "request_panel_beaters"("panelBeaterId");

-- CreateIndex
CREATE INDEX "quotes_panelBeaterId_idx" ON "quotes"("panelBeaterId");

-- CreateIndex
CREATE INDEX "quotes_createdAt_idx" ON "quotes"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "quotes_requestId_panelBeaterId_key" ON "quotes"("requestId", "panelBeaterId");

-- CreateIndex
CREATE INDEX "quote_line_items_quoteId_sortOrder_idx" ON "quote_line_items"("quoteId", "sortOrder");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_panelBeaterId_fkey" FOREIGN KEY ("panelBeaterId") REFERENCES "panel_beaters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurer_rates" ADD CONSTRAINT "insurer_rates_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "insurers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurer_rates" ADD CONSTRAINT "insurer_rates_rateTypeId_fkey" FOREIGN KEY ("rateTypeId") REFERENCES "rate_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panel_beater_rates" ADD CONSTRAINT "panel_beater_rates_panelBeaterId_fkey" FOREIGN KEY ("panelBeaterId") REFERENCES "panel_beaters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panel_beater_rates" ADD CONSTRAINT "panel_beater_rates_rateTypeId_fkey" FOREIGN KEY ("rateTypeId") REFERENCES "rate_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_panelBeaterId_fkey" FOREIGN KEY ("panelBeaterId") REFERENCES "panel_beaters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "insurers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_media" ADD CONSTRAINT "request_media_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "quote_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_panel_beaters" ADD CONSTRAINT "request_panel_beaters_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "quote_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_panel_beaters" ADD CONSTRAINT "request_panel_beaters_panelBeaterId_fkey" FOREIGN KEY ("panelBeaterId") REFERENCES "panel_beaters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "quote_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_panelBeaterId_fkey" FOREIGN KEY ("panelBeaterId") REFERENCES "panel_beaters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
