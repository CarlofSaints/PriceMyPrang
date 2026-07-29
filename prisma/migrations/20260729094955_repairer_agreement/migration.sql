-- The repairer agreement a Super Admin uploads, and each repairer's
-- acceptance of it. Superseded documents are kept, because a signature has
-- to point at the version that was actually agreed to.

-- CreateTable
CREATE TABLE "agreement_documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourcePathname" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "uploadedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agreement_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repairer_agreements" (
    "id" TEXT NOT NULL,
    "panelBeaterId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "sentToName" TEXT NOT NULL,
    "sentToEmail" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),
    "signerName" TEXT,
    "signerTitle" TEXT,
    "signerIp" TEXT,
    "signerUserAgent" TEXT,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repairer_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agreement_documents_active_idx" ON "agreement_documents"("active");

-- CreateIndex
CREATE UNIQUE INDEX "repairer_agreements_token_key" ON "repairer_agreements"("token");

-- CreateIndex
CREATE INDEX "repairer_agreements_panelBeaterId_idx" ON "repairer_agreements"("panelBeaterId");

-- AddForeignKey
ALTER TABLE "repairer_agreements" ADD CONSTRAINT "repairer_agreements_panelBeaterId_fkey" FOREIGN KEY ("panelBeaterId") REFERENCES "panel_beaters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repairer_agreements" ADD CONSTRAINT "repairer_agreements_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "agreement_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
