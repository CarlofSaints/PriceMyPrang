-- Roles are DATA, so changing DEFAULT_ROLES alone would only affect a fresh
-- seed and would leave every live workshop unable to raise additionals.
--
-- Site Admin is not listed: permissionsForRole() special-cases it to
-- ALL_PERMISSIONS, so it picks this up with no row change.

-- The workshop team who actually strip the car and find the extra damage.
UPDATE "roles"
SET "permissions" = array_append("permissions", 'manage_additionals')
WHERE "id" IN ('pb_admin', 'pb_estimator')
  AND NOT ('manage_additionals' = ANY("permissions"));

-- Assessors price work, so they can raise additionals on a job too.
UPDATE "roles"
SET "permissions" = array_append("permissions", 'manage_additionals')
WHERE "id" = 'assessor'
  AND NOT ('manage_additionals' = ANY("permissions"));
