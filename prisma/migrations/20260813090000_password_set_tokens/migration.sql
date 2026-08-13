-- CreateTable
CREATE TABLE "password_set_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_set_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_set_tokens_token_key" ON "password_set_tokens"("token");

-- CreateIndex
CREATE INDEX "password_set_tokens_userId_idx" ON "password_set_tokens"("userId");

-- CreateIndex
CREATE INDEX "password_set_tokens_expiresAt_idx" ON "password_set_tokens"("expiresAt");

-- AddForeignKey
ALTER TABLE "password_set_tokens" ADD CONSTRAINT "password_set_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
