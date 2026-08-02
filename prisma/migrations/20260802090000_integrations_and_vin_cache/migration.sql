-- CreateTable
CREATE TABLE "integration_secrets" (
    "id" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "masked" TEXT NOT NULL,
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vin_lookups" (
    "vin" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "series" TEXT,
    "year" TEXT,
    "mmCode" TEXT,
    "retailValue" DECIMAL(12,2),
    "tradeValue" DECIMAL(12,2),
    "marketValue" DECIMAL(12,2),
    "raw" JSONB,
    "found" BOOLEAN NOT NULL DEFAULT true,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vin_lookups_pkey" PRIMARY KEY ("vin")
);
