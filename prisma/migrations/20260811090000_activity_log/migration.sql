-- The activity log: one row per thing somebody did.
--
-- Hand-written rather than generated, per the project's usual practice — the
-- Prisma migrate CLI can't run non-interactively here.
--
-- Append-only. No UPDATE or DELETE path exists in the app, deliberately.

CREATE TYPE "ActivityOutcome" AS ENUM ('success', 'denied', 'failed');
CREATE TYPE "ActorKind" AS ENUM ('user', 'consumer', 'applicant', 'system');

CREATE TABLE "activity_log" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "entityLabel" TEXT,

    "outcome" "ActivityOutcome" NOT NULL DEFAULT 'success',
    "summary" TEXT NOT NULL,

    "actorKind" "ActorKind" NOT NULL DEFAULT 'user',
    "actorId" TEXT,
    "actorName" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,

    "panelBeaterId" TEXT,

    "method" TEXT,
    "path" TEXT,
    "status" INTEGER,

    "ip" TEXT,
    "userAgent" TEXT,

    "detail" JSONB,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- The log is read newest-first and filtered by one dimension at a time, so
-- each index leads with that dimension and carries createdAt for the sort.
CREATE INDEX "activity_log_createdAt_idx" ON "activity_log"("createdAt");
CREATE INDEX "activity_log_action_createdAt_idx" ON "activity_log"("action", "createdAt");
CREATE INDEX "activity_log_actorId_createdAt_idx" ON "activity_log"("actorId", "createdAt");
CREATE INDEX "activity_log_outcome_createdAt_idx" ON "activity_log"("outcome", "createdAt");
CREATE INDEX "activity_log_panelBeaterId_createdAt_idx" ON "activity_log"("panelBeaterId", "createdAt");
CREATE INDEX "activity_log_entityType_entityId_idx" ON "activity_log"("entityType", "entityId");
