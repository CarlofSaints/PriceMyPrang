-- ---------------------------------------------------------------------------
-- Row-level security: DEFAULT DENY on every table, plus a read-only reporting
-- role for Power BI.
--
-- Why not policies on auth.uid(): this app does not give each user a database
-- login. Every request reaches Postgres as neondb_owner, which has BYPASSRLS,
-- so workshop-vs-workshop isolation lives in the API (lib/workshopAccess.ts).
-- What RLS buys here is that ANY OTHER role (a reporting tool, a future
-- integration, a leaked lesser login) sees no rows unless a policy below says
-- so. The app itself is unaffected.
--
-- A NEW TABLE MUST GET RLS TOO: `npm run db:check-rls` fails while any public
-- table has it off.
-- ---------------------------------------------------------------------------

ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "additional_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "additionals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agreement_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "complaint_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "complaint_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "complaints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consumer_access_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_rate_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dev_ticket_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dev_ticket_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dev_tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_verifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "insurer_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "insurers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_secrets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "login_challenges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "panel_beaters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "password_set_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quote_line_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quote_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quotes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rate_card_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rate_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ratings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reference_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "repairer_agreements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "request_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "request_panel_beaters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vin_lookups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "warranties" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- powerbi_reader: NOLOGIN on purpose. No password belongs in this repo (it is
-- public). When Power BI is connected, create a login role in the Neon console
-- and run:  GRANT powerbi_reader TO <that login>;
--
-- NEVER readable by it: credential and token tables (integration_secrets,
-- login_challenges, password_set_tokens, email_verifications,
-- consumer_access_links), internal plumbing (_prisma_migrations,
-- reference_counters, dev_*, agreement_documents, vin_lookups) and raw media
-- paths (request_media, complaint_media).
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powerbi_reader') THEN
    CREATE ROLE powerbi_reader NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO powerbi_reader;

-- Whole tables: nothing secret on them.
GRANT SELECT ON
  "activity_log", "additional_lines", "additionals", "complaints", "complaint_notes",
  "custom_rate_types", "insurer_contacts", "insurers", "panel_beaters", "payments",
  "quote_line_items", "quotes", "rate_card_values", "rate_cards", "ratings",
  "request_panel_beaters", "roles", "suppliers", "warranties"
TO powerbi_reader;

-- Column grants: everything EXCEPT the password hash, the client's link token
-- and the agreement signing token.
GRANT SELECT (id, name, email, active, "roleId", "panelBeaterId", "createdAt", "updatedAt",
  "mustChangePassword", "emailVerifiedAt", "twoFactorEnabled") ON "users" TO powerbi_reader;
GRANT SELECT (id, reference, status, "firstName", "lastName", email, phone, "companyName",
  "hasInsurance", "insurerName", "insurerId", "underWarranty", "isInsuranceClaim", "claimNumber",
  "noClaimNumberYet", "isThirdPartyClaim", "suspectedEngineDamage", "quotesRequested", vin, make,
  model, series, year, colour, registration, "discRawText", "mileageKm", "repairerInitiated", lat,
  lng, "letUsChoose", "createdAt", "updatedAt", "rateCardId", town, province,
  "nearestPanelBeaterKm") ON "quote_requests" TO powerbi_reader;
GRANT SELECT (id, "panelBeaterId", "documentId", "sentToName", "sentToEmail", "signedAt",
  "signerName", "signerTitle", "pdfUrl", "createdAt", "updatedAt")
  ON "repairer_agreements" TO powerbi_reader;

-- The one read policy: reporting role only, every row (it is a company-wide
-- report, not a per-workshop view).
CREATE POLICY powerbi_read ON "activity_log" FOR SELECT TO powerbi_reader USING (true);
CREATE POLICY powerbi_read ON "additional_lines" FOR SELECT TO powerbi_reader USING (true);
CREATE POLICY powerbi_read ON "additionals" FOR SELECT TO powerbi_reader USING (true);
CREATE POLICY powerbi_read ON "complaints" FOR SELECT TO powerbi_reader USING (true);
CREATE POLICY powerbi_read ON "complaint_notes" FOR SELECT TO powerbi_reader USING (true);
CREATE POLICY powerbi_read ON "custom_rate_types" FOR SELECT TO powerbi_reader USING (true);
CREATE POLICY powerbi_read ON "insurer_contacts" FOR SELECT TO powerbi_reader USING (true);
CREATE POLICY powerbi_read ON "insurers" FOR SELECT TO powerbi_reader USING (true);
CREATE POLICY powerbi_read ON "panel_beaters" FOR SELECT TO powerbi_reader USING (true);
CREATE POLICY powerbi_read ON "payments" FOR SELECT TO powerbi_reader USING (true);
CREATE POLICY powerbi_read ON "quote_line_items" FOR SELECT TO powerbi_reader USING (true);
CREATE POLICY powerbi_read ON "quotes" FOR SELECT TO powerbi_reader USING (true);
CREATE POLICY powerbi_read ON "rate_card_values" FOR SELECT TO powerbi_reader USING (true);
CREATE POLICY powerbi_read ON "rate_cards" FOR SELECT TO powerbi_reader USING (true);
CREATE POLICY powerbi_read ON "ratings" FOR SELECT TO powerbi_reader USING (true);
CREATE POLICY powerbi_read ON "request_panel_beaters" FOR SELECT TO powerbi_reader USING (true);
CREATE POLICY powerbi_read ON "roles" FOR SELECT TO powerbi_reader USING (true);
CREATE POLICY powerbi_read ON "suppliers" FOR SELECT TO powerbi_reader USING (true);
CREATE POLICY powerbi_read ON "warranties" FOR SELECT TO powerbi_reader USING (true);
CREATE POLICY powerbi_read ON "users" FOR SELECT TO powerbi_reader USING (true);
CREATE POLICY powerbi_read ON "quote_requests" FOR SELECT TO powerbi_reader USING (true);
CREATE POLICY powerbi_read ON "repairer_agreements" FOR SELECT TO powerbi_reader USING (true);

-- Power BI's navigator selects every column, which a column grant refuses.
-- These views list only the granted columns. security_invoker: they run AS THE
-- READER, so its grants and the policies above still apply (a plain view runs
-- as its owner and would bypass both).
CREATE SCHEMA IF NOT EXISTS reporting;
GRANT USAGE ON SCHEMA reporting TO powerbi_reader;

CREATE VIEW reporting.users WITH (security_invoker = true) AS
  SELECT id, name, email, active, "roleId", "panelBeaterId", "createdAt", "updatedAt",
    "mustChangePassword", "emailVerifiedAt", "twoFactorEnabled"
  FROM public."users";

CREATE VIEW reporting.quote_requests WITH (security_invoker = true) AS
  SELECT id, reference, status, "firstName", "lastName", email, phone, "companyName",
    "hasInsurance", "insurerName", "insurerId", "underWarranty", "isInsuranceClaim", "claimNumber",
    "noClaimNumberYet", "isThirdPartyClaim", "suspectedEngineDamage", "quotesRequested", vin, make,
    model, series, year, colour, registration, "discRawText", "mileageKm", "repairerInitiated", lat,
    lng, "letUsChoose", "createdAt", "updatedAt", "rateCardId", town, province,
    "nearestPanelBeaterKm"
  FROM public."quote_requests";

CREATE VIEW reporting.repairer_agreements WITH (security_invoker = true) AS
  SELECT id, "panelBeaterId", "documentId", "sentToName", "sentToEmail", "signedAt",
    "signerName", "signerTitle", "pdfUrl", "createdAt", "updatedAt"
  FROM public."repairer_agreements";

GRANT SELECT ON reporting.users, reporting.quote_requests, reporting.repairer_agreements
  TO powerbi_reader;
