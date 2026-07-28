-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('platform', 'panel_beater');

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "scope" "RoleScope" NOT NULL DEFAULT 'platform';

-- Roles PMP staff hold keep the default scope. The three below belong to a
-- panel beater's own team, and are the only ones a workshop admin may assign.
INSERT INTO "roles" ("id", "name", "permissions", "system", "scope", "createdAt", "updatedAt")
VALUES
  ('pb_admin',     'Admin',     ARRAY['onboard_self','manage_users'], false, 'panel_beater', NOW(), NOW()),
  ('pb_estimator', 'Estimator', ARRAY['onboard_self'],                false, 'panel_beater', NOW(), NOW()),
  ('pb_buyer',     'Buyer',     ARRAY['onboard_self'],                false, 'panel_beater', NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- The old catch-all "Panel Beater" role is superseded by the three above. Its
-- holders were the workshop's first users, who are now its admins.
UPDATE "users" SET "roleId" = 'pb_admin' WHERE "roleId" = 'panel_beater';
DELETE FROM "roles" WHERE "id" = 'panel_beater';

-- manage_rate_types no longer exists; leaving it in a stored array would render
-- as an unlabelled permission on the Roles page.
UPDATE "roles" SET "permissions" = array_remove("permissions", 'manage_rate_types');
