-- Roles are DATA, so changing DEFAULT_ROLES alone would only affect a fresh
-- seed and would leave every live workshop unable to reach the new page.
UPDATE "roles"
SET "permissions" = array_append("permissions", 'manage_own_complaints')
WHERE "id" = 'pb_admin'
  AND NOT ('manage_own_complaints' = ANY("permissions"));

-- Assessors are the people who actually work a complaint through.
UPDATE "roles"
SET "permissions" = array_append("permissions", 'manage_complaints')
WHERE "id" = 'assessor'
  AND NOT ('manage_complaints' = ANY("permissions"));
