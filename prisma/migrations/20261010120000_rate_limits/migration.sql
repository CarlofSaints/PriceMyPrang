-- Shared rate-limit counters (lib/rateLimit.ts).
CREATE TABLE "rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- Default deny, like every other table (20261010090000): the app connects as
-- the owner, which bypasses RLS, and nothing else (powerbi_reader included)
-- has any business reading who is being throttled. No policy, no grant.
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;
