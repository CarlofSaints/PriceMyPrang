-- "Admin" meant both a Price my Prang administrator and a workshop's own
-- administrator, so the users list showed the same word for two very
-- different levels of access. Rename the seeded roles; ids are untouched, so
-- nothing that references them by id is affected.
UPDATE "roles" SET "name" = 'Site Admin'         WHERE "id" = 'admin'    AND "name" = 'Admin';
UPDATE "roles" SET "name" = 'Panel Beater Admin' WHERE "id" = 'pb_admin' AND "name" = 'Admin';
