-- Additive: existing rows keep a NULL clientId until the admin re-saves.
ALTER TABLE "integration_secrets" ADD COLUMN "clientId" TEXT;
