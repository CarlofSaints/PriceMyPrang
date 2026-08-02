import { getDb } from "./db";
import { decryptSecret, type SealedSecret } from "./secrets";
import type { Prisma, MediaKind } from "./generated/prisma/client";
import { nextReference } from "./reference";
import { DEFAULT_ROLES } from "./permissions";
import { isKnownField } from "./rateCard";
import type {
  User,
  Role,
  Permission,
  RateValues,
  RateScope,
  RateCard,
  RateCardKind,
  AgreementDocument,
  RepairerAgreement,
  InsuranceCompany,
  PanelBeater,
  PartType,
  Supplier,
  QuoteRequest,
  QuoteLineItem,
  BuiltQuote,
  MediaRef,
  RequiredPhotos,
  RequestStatus,
  QuoteStatus,
  WarrantyApproval,
  DevTicket,
  DevTicketAttachment,
  DevTicketNote,
  DevTicketStats,
  DevPriority,
  DevTicketStatus,
  VinLookupResult,
} from "./types";

// ---------------------------------------------------------------------------
// Data access. Everything the app reads or writes goes through here.
//
// Records live in Neon Postgres; file BYTES stay in Vercel Blob and are
// referenced by pathname + proxy URL (see lib/blob.ts).
//
// The exported signatures are unchanged from the Blob-JSON implementation so
// callers didn't have to move, with two deliberate exceptions: getAllRequests
// (replaced by listRequests/getDashboardStats — it could not survive scale) and
// saveRequest (replaced by the narrower updateRequestStatus/upsertQuote).
// ---------------------------------------------------------------------------

/** Prisma returns Decimal objects; the app works in plain numbers. */
type DecimalLike = { toNumber(): number };
const num = (d: DecimalLike | null | undefined): number => (d ? d.toNumber() : 0);
const numOpt = (d: DecimalLike | null | undefined): number | undefined =>
  d === null || d === undefined ? undefined : d.toNumber();

const iso = (d: Date): string => d.toISOString();
/** @db.Date columns surface as Date; the app carries them as "yyyy-mm-dd". */
const dateOnly = (d: Date | null): string | undefined =>
  d ? d.toISOString().slice(0, 10) : undefined;
const toDate = (s: string | undefined): Date | null => (s ? new Date(s) : null);

// ---- Users ----------------------------------------------------------------

type UserRow = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  roleId: string;
  panelBeaterId: string | null;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
};

const toUser = (r: UserRow): User => ({
  id: r.id,
  name: r.name,
  email: r.email,
  passwordHash: r.passwordHash,
  role: r.roleId,
  panelBeaterId: r.panelBeaterId ?? undefined,
  active: r.active,
  mustChangePassword: r.mustChangePassword,
  createdAt: iso(r.createdAt),
});

export async function getUsers(): Promise<User[]> {
  const rows = await getDb().user.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map(toUser);
}

/**
 * Replace the whole user collection (the Users page posts the full list).
 * Upserts everything supplied and removes anything no longer present.
 */
export async function saveUsers(users: User[]): Promise<void> {
  const db = getDb();
  await db.$transaction(async (tx) => {
    for (const u of users) {
      const data = {
        name: u.name,
        email: u.email.toLowerCase(),
        passwordHash: u.passwordHash,
        roleId: u.role,
        panelBeaterId: u.panelBeaterId ?? null,
        active: u.active,
        mustChangePassword: u.mustChangePassword ?? false,
      };
      await tx.user.upsert({
        where: { id: u.id },
        create: { id: u.id, ...data, createdAt: new Date(u.createdAt) },
        update: data,
      });
    }
    await tx.user.deleteMany({ where: { id: { notIn: users.map((u) => u.id) } } });
  });
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const row = await getDb().user.findUnique({ where: { email: email.toLowerCase() } });
  return row ? toUser(row) : null;
}

export async function findUserById(id: string): Promise<User | null> {
  const row = await getDb().user.findUnique({ where: { id } });
  return row ? toUser(row) : null;
}

/**
 * Change one user's password.
 *
 * Deliberately NOT saveUsers() — that replaces the whole collection and deletes
 * anyone missing from the list, which is fine for the admin Users page but far
 * too blunt for a self-service endpoint. This touches a single row.
 */
export async function setUserPassword(
  id: string,
  passwordHash: string,
  mustChangePassword = false
): Promise<void> {
  await getDb().user.update({
    where: { id },
    data: { passwordHash, mustChangePassword },
  });
}

/**
 * Remove one user.
 *
 * Deliberately NOT saveUsers() — that replaces the whole collection, so a
 * caller working from a filtered list (a workshop admin sees only their own
 * team) would delete everyone they couldn't see.
 */
export async function deleteUser(id: string): Promise<void> {
  await getDb().user.delete({ where: { id } });
}

export async function upsertUser(user: User): Promise<void> {
  const data = {
    name: user.name,
    email: user.email.toLowerCase(),
    passwordHash: user.passwordHash,
    roleId: user.role,
    panelBeaterId: user.panelBeaterId ?? null,
    active: user.active,
    mustChangePassword: user.mustChangePassword ?? false,
  };
  await getDb().user.upsert({
    where: { id: user.id },
    create: { id: user.id, ...data, createdAt: new Date(user.createdAt) },
    update: data,
  });
}

// ---- Roles ----------------------------------------------------------------

const toRole = (r: {
  id: string;
  name: string;
  permissions: string[];
  system: boolean;
  scope: string;
}): Role => ({
  id: r.id,
  name: r.name,
  permissions: r.permissions as Permission[],
  system: r.system,
  scope: r.scope as Role["scope"],
});

export async function getRoles(): Promise<Role[]> {
  const db = getDb();
  const rows = await db.role.findMany({ orderBy: { createdAt: "asc" } });
  if (rows.length) return rows.map(toRole);

  // Seed the built-in roles on first use, as the JSON store did.
  await db.role.createMany({
    data: DEFAULT_ROLES.map((r) => ({
      id: r.id,
      name: r.name,
      permissions: r.permissions,
      system: !!r.system,
      scope: r.scope,
    })),
    skipDuplicates: true,
  });
  return DEFAULT_ROLES;
}

export async function saveRoles(roles: Role[]): Promise<void> {
  const db = getDb();
  await db.$transaction(async (tx) => {
    for (const r of roles) {
      const data = { name: r.name, permissions: r.permissions, system: !!r.system, scope: r.scope };
      await tx.role.upsert({
        where: { id: r.id },
        create: { id: r.id, ...data },
        update: data,
      });
    }
    await tx.role.deleteMany({ where: { id: { notIn: roles.map((r) => r.id) } } });
  });
}

export async function getRole(id: string): Promise<Role | null> {
  const row = await getDb().role.findUnique({ where: { id } });
  return row ? toRole(row) : null;
}

// ---- Repairer agreement ---------------------------------------------------

const toAgreementDoc = (r: {
  id: string;
  title: string;
  html: string;
  sourceUrl: string;
  sourcePathname: string;
  active: boolean;
  uploadedByName: string | null;
  createdAt: Date;
}): AgreementDocument => ({
  id: r.id,
  title: r.title,
  html: r.html,
  sourceUrl: r.sourceUrl,
  sourcePathname: r.sourcePathname,
  active: r.active,
  uploadedByName: r.uploadedByName ?? undefined,
  createdAt: iso(r.createdAt),
});

/** The document new repairers are asked to sign. Null until one is uploaded. */
export async function getActiveAgreementDocument(): Promise<AgreementDocument | null> {
  const row = await getDb().agreementDocument.findFirst({
    where: { active: true },
    orderBy: { createdAt: "desc" },
  });
  return row ? toAgreementDoc(row) : null;
}

export async function listAgreementDocuments(): Promise<AgreementDocument[]> {
  const rows = await getDb().agreementDocument.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(toAgreementDoc);
}

/**
 * Store a newly uploaded agreement and make it the active one. Only one can be
 * active — a repairer signing tomorrow must not get yesterday's terms.
 */
export async function addAgreementDocument(doc: AgreementDocument): Promise<void> {
  const db = getDb();
  await db.$transaction(async (tx) => {
    await tx.agreementDocument.updateMany({ where: { active: true }, data: { active: false } });
    await tx.agreementDocument.create({
      data: {
        id: doc.id,
        title: doc.title,
        html: doc.html,
        sourceUrl: doc.sourceUrl,
        sourcePathname: doc.sourcePathname,
        active: true,
        uploadedByName: doc.uploadedByName ?? null,
        createdAt: new Date(doc.createdAt),
      },
    });
  });
}

/**
 * Remove a document. Refused once anyone has signed it — the signature would
 * otherwise point at nothing, and what they agreed to becomes unprovable.
 */
export async function deleteAgreementDocument(
  id: string
): Promise<{ ok: true } | { ok: false; reason: "signed" }> {
  const db = getDb();
  const signed = await db.repairerAgreement.count({ where: { documentId: id } });
  if (signed > 0) return { ok: false, reason: "signed" };
  await db.agreementDocument.delete({ where: { id } });
  return { ok: true };
}

const toRepairerAgreement = (r: {
  id: string;
  panelBeaterId: string;
  documentId: string;
  token: string;
  sentToName: string;
  sentToEmail: string;
  signedAt: Date | null;
  signerName: string | null;
  signerTitle: string | null;
  signerIp: string | null;
  signerUserAgent: string | null;
  pdfUrl: string | null;
  createdAt: Date;
}): RepairerAgreement => ({
  id: r.id,
  panelBeaterId: r.panelBeaterId,
  documentId: r.documentId,
  token: r.token,
  sentToName: r.sentToName,
  sentToEmail: r.sentToEmail,
  signedAt: r.signedAt ? iso(r.signedAt) : undefined,
  signerName: r.signerName ?? undefined,
  signerTitle: r.signerTitle ?? undefined,
  signerIp: r.signerIp ?? undefined,
  signerUserAgent: r.signerUserAgent ?? undefined,
  pdfUrl: r.pdfUrl ?? undefined,
  createdAt: iso(r.createdAt),
});

export async function createRepairerAgreement(opts: {
  panelBeaterId: string;
  documentId: string;
  sentToName: string;
  sentToEmail: string;
}): Promise<RepairerAgreement> {
  const row = await getDb().repairerAgreement.create({
    data: {
      panelBeaterId: opts.panelBeaterId,
      documentId: opts.documentId,
      token: crypto.randomUUID(),
      sentToName: opts.sentToName,
      sentToEmail: opts.sentToEmail.toLowerCase(),
    },
  });
  return toRepairerAgreement(row);
}

export async function getRepairerAgreementByToken(
  token: string
): Promise<{ agreement: RepairerAgreement; document: AgreementDocument } | null> {
  if (!token) return null;
  const row = await getDb().repairerAgreement.findUnique({
    where: { token },
    include: { document: true },
  });
  return row
    ? { agreement: toRepairerAgreement(row), document: toAgreementDoc(row.document) }
    : null;
}

export async function getRepairerAgreements(panelBeaterId: string): Promise<RepairerAgreement[]> {
  const rows = await getDb().repairerAgreement.findMany({
    where: { panelBeaterId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toRepairerAgreement);
}

/** Record the acceptance. Refuses to re-sign one that's already signed. */
export async function signRepairerAgreement(
  token: string,
  signature: {
    signerName: string;
    signerTitle?: string;
    signerIp?: string;
    signerUserAgent?: string;
    pdfUrl?: string;
  }
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "already_signed" }> {
  const db = getDb();
  return db.$transaction(async (tx) => {
    const row = await tx.repairerAgreement.findUnique({
      where: { token },
      select: { id: true, signedAt: true },
    });
    if (!row) return { ok: false as const, reason: "not_found" as const };
    if (row.signedAt) return { ok: false as const, reason: "already_signed" as const };

    await tx.repairerAgreement.update({
      where: { id: row.id },
      data: {
        signedAt: new Date(),
        signerName: signature.signerName,
        signerTitle: signature.signerTitle ?? null,
        signerIp: signature.signerIp ?? null,
        signerUserAgent: signature.signerUserAgent ?? null,
        pdfUrl: signature.pdfUrl ?? null,
      },
    });
    return { ok: true as const };
  });
}

export async function setRepairerAgreementPdf(id: string, pdfUrl: string): Promise<void> {
  await getDb().repairerAgreement.update({ where: { id }, data: { pdfUrl } });
}

// ---- Rate values ----------------------------------------------------------

/** Rows of (scope, field, value) → the nested shape the app and forms use. */
function toRateValues(rows: { scope: string; field: string; value: DecimalLike }[]): RateValues {
  const out: RateValues = {};
  for (const r of rows) {
    const scope = r.scope as RateScope;
    // Drop anything not in the current catalogue, so retiring a field can't
    // resurrect stale numbers on screen.
    if (!isKnownField(scope, r.field)) continue;
    (out[scope] ??= {})[r.field] = num(r.value);
  }
  return out;
}

/** The nested shape → rows, dropping blanks and anything off-catalogue. */
function fromRateValues(values: RateValues): { scope: RateScope; field: string; value: number }[] {
  const rows: { scope: RateScope; field: string; value: number }[] = [];
  for (const [scope, fields] of Object.entries(values ?? {})) {
    for (const [field, value] of Object.entries(fields ?? {})) {
      if (!isKnownField(scope as RateScope, field)) continue;
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) continue;
      rows.push({ scope: scope as RateScope, field, value: n });
    }
  }
  return rows;
}

// ---- Insurance companies --------------------------------------------------

type InsurerRow = {
  id: string;
  name: string;
  active: boolean;
  createdAt: Date;
};

const toInsurer = (r: InsurerRow): InsuranceCompany => ({
  id: r.id,
  name: r.name,
  active: r.active,
  createdAt: iso(r.createdAt),
});

export async function getInsurers(): Promise<InsuranceCompany[]> {
  const rows = await getDb().insurer.findMany({ orderBy: { name: "asc" } });
  return rows.map(toInsurer);
}

export async function saveInsurers(insurers: InsuranceCompany[]): Promise<void> {
  const db = getDb();
  await db.$transaction(async (tx) => {
    for (const i of insurers) await writeInsurer(tx, i);
    await tx.insurer.deleteMany({ where: { id: { notIn: insurers.map((i) => i.id) } } });
  });
}

/**
 * Insurer names consumers typed into "Other / not listed" that still don't
 * match anything in the list, most-requested first.
 *
 * These are SUGGESTIONS, never entries: the text is unverified — typos, broker
 * names, "work policy" — so an admin decides what becomes a real option. A name
 * disappears from here the moment it's added, because it then matches.
 */
export async function listSuggestedInsurers(): Promise<
  { name: string; count: number; lastSeen: string }[]
> {
  const db = getDb();
  const [rows, existing] = await Promise.all([
    db.quoteRequest.findMany({
      where: { insurerId: null, insurerName: { not: null } },
      select: { insurerName: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    db.insurer.findMany({ select: { name: true } }),
  ]);

  const known = new Set(existing.map((i) => i.name.trim().toLowerCase()));
  const seen = new Map<string, { name: string; count: number; lastSeen: string }>();

  for (const r of rows) {
    const name = r.insurerName?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (known.has(key)) continue;
    const hit = seen.get(key);
    // Rows arrive newest-first, so the first spelling seen is the most recent
    // one, and its date is the latest.
    if (hit) hit.count++;
    else seen.set(key, { name, count: 1, lastSeen: iso(r.createdAt) });
  }

  return [...seen.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function getInsurer(id: string): Promise<InsuranceCompany | null> {
  const row = await getDb().insurer.findUnique({ where: { id } });
  return row ? toInsurer(row) : null;
}

export async function upsertInsurer(insurer: InsuranceCompany): Promise<void> {
  await getDb().$transaction((tx) => writeInsurer(tx, insurer));
}

/** Shared insurer write — replaces the rate card wholesale. */
async function writeInsurer(
  tx: TxClient,
  i: InsuranceCompany
): Promise<void> {
  const data = { name: i.name, active: i.active };
  await tx.insurer.upsert({
    where: { id: i.id },
    create: { id: i.id, ...data, createdAt: new Date(i.createdAt) },
    update: data,
  });
}

// ---- Panel beaters --------------------------------------------------------

type WarrantyRow = {
  manufacturer: string;
  startDate: Date | null;
  expiryDate: Date | null;
  certificateUrl: string | null;
  certificatePathname: string | null;
  certificateContentType: string | null;
  remind: boolean;
  remindersSent: string[];
};

type PanelBeaterRow = {
  id: string;
  completedByName: string | null;
  completedByEmail: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  companyName: string;
  tradingAs: string | null;
  companyRegNumber: string;
  vatNumber: string | null;
  physicalAddress: string;
  lat: number | null;
  lng: number | null;
  mibcoNumber: string | null;
  rmiNumber: string;
  sambraNumber: string | null;
  miwaNumber: string | null;
  labourRateSenior: DecimalLike | null;
  labourRateJunior: DecimalLike | null;
  logoUrl: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
  status: string;
  submittedByPublic: boolean;
  createdAt: Date;
  warranties: WarrantyRow[];
};

const toWarranty = (w: WarrantyRow): WarrantyApproval => ({
  manufacturer: w.manufacturer,
  startDate: dateOnly(w.startDate),
  expiryDate: dateOnly(w.expiryDate),
  certificate: w.certificateUrl
    ? {
        url: w.certificateUrl,
        pathname: w.certificatePathname ?? "",
        contentType: w.certificateContentType ?? undefined,
      }
    : undefined,
  remind: w.remind,
  remindersSent: w.remindersSent,
});

const toPanelBeater = (r: PanelBeaterRow): PanelBeater => ({
  id: r.id,
  completedByName: r.completedByName ?? undefined,
  completedByEmail: r.completedByEmail ?? undefined,
  ownerName: r.ownerName ?? undefined,
  ownerEmail: r.ownerEmail ?? undefined,
  companyName: r.companyName,
  tradingAs: r.tradingAs ?? undefined,
  companyRegNumber: r.companyRegNumber,
  vatNumber: r.vatNumber ?? undefined,
  physicalAddress: r.physicalAddress,
  lat: r.lat ?? undefined,
  lng: r.lng ?? undefined,
  mibcoNumber: r.mibcoNumber ?? undefined,
  rmiNumber: r.rmiNumber,
  sambraNumber: r.sambraNumber ?? undefined,
  miwaNumber: r.miwaNumber ?? undefined,
  labourRateSenior: numOpt(r.labourRateSenior),
  labourRateJunior: numOpt(r.labourRateJunior),
  logoUrl: r.logoUrl ?? undefined,
  email: r.email ?? undefined,
  phone: r.phone ?? undefined,
  warranties: r.warranties.map(toWarranty),
  active: r.active,
  status: r.status as PanelBeater["status"],
  submittedByPublic: r.submittedByPublic || undefined,
  createdAt: iso(r.createdAt),
});

const PB_INCLUDE = { warranties: { orderBy: { manufacturer: "asc" } } } as const;

export async function getPanelBeaters(): Promise<PanelBeater[]> {
  const rows = await getDb().panelBeater.findMany({
    include: PB_INCLUDE,
    orderBy: { companyName: "asc" },
  });
  return rows.map(toPanelBeater);
}

export async function savePanelBeaters(list: PanelBeater[]): Promise<void> {
  const db = getDb();
  await db.$transaction(async (tx) => {
    for (const pb of list) await writePanelBeater(tx, pb);
    await tx.panelBeater.deleteMany({ where: { id: { notIn: list.map((p) => p.id) } } });
  });
}

export async function getPanelBeater(id: string): Promise<PanelBeater | null> {
  const row = await getDb().panelBeater.findUnique({ where: { id }, include: PB_INCLUDE });
  return row ? toPanelBeater(row) : null;
}

export async function upsertPanelBeater(pb: PanelBeater): Promise<void> {
  await getDb().$transaction((tx) => writePanelBeater(tx, pb));
}

async function writePanelBeater(tx: TxClient, pb: PanelBeater): Promise<void> {
  const data = {
    completedByName: pb.completedByName ?? null,
    completedByEmail: pb.completedByEmail ?? null,
    ownerName: pb.ownerName ?? null,
    ownerEmail: pb.ownerEmail ?? null,
    companyName: pb.companyName,
    tradingAs: pb.tradingAs ?? null,
    companyRegNumber: pb.companyRegNumber,
    vatNumber: pb.vatNumber ?? null,
    physicalAddress: pb.physicalAddress,
    lat: pb.lat ?? null,
    lng: pb.lng ?? null,
    mibcoNumber: pb.mibcoNumber ?? null,
    rmiNumber: pb.rmiNumber,
    sambraNumber: pb.sambraNumber ?? null,
    miwaNumber: pb.miwaNumber ?? null,
    labourRateSenior: pb.labourRateSenior ?? null,
    labourRateJunior: pb.labourRateJunior ?? null,
    logoUrl: pb.logoUrl ?? null,
    email: pb.email ?? null,
    phone: pb.phone ?? null,
    active: pb.active,
    status: pb.status ?? "pending",
    submittedByPublic: !!pb.submittedByPublic,
  };

  await tx.panelBeater.upsert({
    where: { id: pb.id },
    create: { id: pb.id, ...data, createdAt: new Date(pb.createdAt) },
    update: data,
  });

  // Warranties are replaced wholesale — the forms post the complete set and
  // it's small. Rate cards are NOT touched here: they're edited on their own
  // page, and a listing edit must never wipe a workshop's pricing.
  await tx.warranty.deleteMany({ where: { panelBeaterId: pb.id } });
  const warranties = pb.warranties ?? [];
  if (warranties.length) {
    await tx.warranty.createMany({
      data: warranties.map((w) => ({
        panelBeaterId: pb.id,
        manufacturer: w.manufacturer,
        startDate: toDate(w.startDate),
        expiryDate: toDate(w.expiryDate),
        certificateUrl: w.certificate?.url ?? null,
        certificatePathname: w.certificate?.pathname ?? null,
        certificateContentType: w.certificate?.contentType ?? null,
        remind: !!w.remind,
        remindersSent: w.remindersSent ?? [],
      })),
    });
  }
}

// ---- Suppliers ------------------------------------------------------------

const toSupplier = (r: {
  id: string;
  name: string;
  partTypes: string[];
  makes: string[];
  supplies: string | null;
  email: string | null;
  phone: string | null;
  panelBeaterId?: string | null;
  companyRegNumber?: string | null;
  vatNumber?: string | null;
  address?: string | null;
  mainContactName?: string | null;
  mainContactPhone?: string | null;
  mainContactEmail?: string | null;
  billingContactName?: string | null;
  billingContactPhone?: string | null;
  billingContactEmail?: string | null;
  active: boolean;
  createdAt: Date;
}): Supplier => ({
  id: r.id,
  panelBeaterId: r.panelBeaterId ?? undefined,
  name: r.name,
  partTypes: r.partTypes as PartType[],
  makes: r.makes,
  supplies: r.supplies ?? undefined,
  email: r.email ?? undefined,
  phone: r.phone ?? undefined,
  companyRegNumber: r.companyRegNumber ?? undefined,
  vatNumber: r.vatNumber ?? undefined,
  address: r.address ?? undefined,
  mainContactName: r.mainContactName ?? undefined,
  mainContactPhone: r.mainContactPhone ?? undefined,
  mainContactEmail: r.mainContactEmail ?? undefined,
  billingContactName: r.billingContactName ?? undefined,
  billingContactPhone: r.billingContactPhone ?? undefined,
  billingContactEmail: r.billingContactEmail ?? undefined,
  active: r.active,
  createdAt: iso(r.createdAt),
});

/** Every optional detail field, shared by create and update. */
const supplierDetail = (s: Partial<Supplier>) => ({
  supplies: s.supplies ?? null,
  email: s.email ?? null,
  phone: s.phone ?? null,
  companyRegNumber: s.companyRegNumber ?? null,
  vatNumber: s.vatNumber ?? null,
  address: s.address ?? null,
  mainContactName: s.mainContactName ?? null,
  mainContactPhone: s.mainContactPhone ?? null,
  mainContactEmail: s.mainContactEmail ?? null,
  billingContactName: s.billingContactName ?? null,
  billingContactPhone: s.billingContactPhone ?? null,
  billingContactEmail: s.billingContactEmail ?? null,
});

/**
 * Price my Prang's OWN list only. Deliberately excludes workshop-private
 * suppliers, or the Control Centre page would fill up with every repairer's
 * private book.
 */
export async function getSuppliers(): Promise<Supplier[]> {
  const rows = await getDb().supplier.findMany({
    where: { panelBeaterId: null },
    orderBy: { name: "asc" },
  });
  return rows.map(toSupplier);
}

/** One workshop's own suppliers. Never another's. */
export async function listSuppliersForPanelBeater(panelBeaterId: string): Promise<Supplier[]> {
  const rows = await getDb().supplier.findMany({
    where: { panelBeaterId },
    orderBy: { name: "asc" },
  });
  return rows.map(toSupplier);
}

export async function createPanelBeaterSupplier(
  panelBeaterId: string,
  s: Partial<Supplier> & { name: string }
): Promise<Supplier> {
  const row = await getDb().supplier.create({
    data: {
      panelBeaterId,
      name: s.name,
      partTypes: s.partTypes ?? [],
      makes: s.makes ?? [],
      active: s.active ?? true,
      ...supplierDetail(s),
    },
  });
  return toSupplier(row);
}

/**
 * Update ONE supplier, and only if it belongs to the given workshop.
 *
 * Deliberately NOT saveSuppliers() — that replaces the entire collection and
 * deletes anything missing from the list it is handed, which from a workshop's
 * own page would wipe Price my Prang's list and every other repairer's book.
 * Returns null when the row isn't theirs, so the route can 404 rather than
 * confirm that someone else's supplier exists.
 */
export async function updatePanelBeaterSupplier(
  id: string,
  panelBeaterId: string,
  s: Partial<Supplier>
): Promise<Supplier | null> {
  const db = getDb();
  const existing = await db.supplier.findFirst({ where: { id, panelBeaterId } });
  if (!existing) return null;

  const row = await db.supplier.update({
    where: { id },
    data: {
      ...(s.name !== undefined ? { name: s.name } : {}),
      ...(s.partTypes !== undefined ? { partTypes: s.partTypes } : {}),
      ...(s.makes !== undefined ? { makes: s.makes } : {}),
      ...(s.active !== undefined ? { active: s.active } : {}),
      ...supplierDetail(s),
    },
  });
  return toSupplier(row);
}

/** Same ownership check as the update — a miss is a 404, never a 403. */
export async function deletePanelBeaterSupplier(
  id: string,
  panelBeaterId: string
): Promise<boolean> {
  const { count } = await getDb().supplier.deleteMany({ where: { id, panelBeaterId } });
  return count > 0;
}

/**
 * Replace Price my Prang's OWN supplier list (the Control Centre page posts the
 * whole collection).
 *
 * The prune is scoped to `panelBeaterId: null`. Without that it would delete
 * every workshop's private supplier book on any save from this page, since none
 * of those ids appear in the list it is handed.
 */
export async function saveSuppliers(suppliers: Supplier[]): Promise<void> {
  const db = getDb();
  await db.$transaction(async (tx) => {
    for (const s of suppliers) {
      const data = {
        name: s.name,
        partTypes: s.partTypes,
        makes: s.makes,
        active: s.active,
        ...supplierDetail(s),
      };
      await tx.supplier.upsert({
        where: { id: s.id },
        create: { id: s.id, panelBeaterId: null, ...data, createdAt: new Date(s.createdAt) },
        update: data,
      });
    }
    await tx.supplier.deleteMany({
      where: { panelBeaterId: null, id: { notIn: suppliers.map((s) => s.id) } },
    });
  });
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  const row = await getDb().supplier.findUnique({ where: { id } });
  return row ? toSupplier(row) : null;
}

export async function upsertSupplier(supplier: Supplier): Promise<void> {
  const data = {
    name: supplier.name,
    partTypes: supplier.partTypes,
    makes: supplier.makes,
    active: supplier.active,
    ...supplierDetail(supplier),
  };
  await getDb().supplier.upsert({
    where: { id: supplier.id },
    create: { id: supplier.id, ...data, createdAt: new Date(supplier.createdAt) },
    update: data,
  });
}

// ---- Requests -------------------------------------------------------------

type MediaRow = {
  kind: string;
  url: string;
  pathname: string;
  contentType: string | null;
  sortOrder: number;
};

const mediaRef = (m: MediaRow): MediaRef => ({
  url: m.url,
  pathname: m.pathname,
  contentType: m.contentType ?? undefined,
});

const PHOTO_KIND: Record<string, keyof RequiredPhotos> = {
  photo_front: "front",
  photo_back: "back",
  photo_left: "left",
  photo_right: "right",
};

const toQuote = (q: QuoteRow, reference: string): BuiltQuote => ({
  id: q.id,
  reference,
  panelBeaterId: q.panelBeaterId,
  lines: q.lines.map(
    (l): QuoteLineItem => ({
      code: l.code ?? undefined,
      description: l.description,
      quantity: num(l.quantity),
      partsCost: numOpt(l.partsCost),
      partsAmount: num(l.partsAmount),
      partId: l.partId ?? undefined,
      supplier: l.supplier ?? undefined,
      partNumber: l.partNumber ?? undefined,
      panelCode: l.panelCode ?? undefined,
      panelAmount: num(l.panelAmount),
      panelHours: num(l.panelHours),
      paintCode: l.paintCode ?? undefined,
      paintAmount: num(l.paintAmount),
      paintHours: num(l.paintHours),
      stripCode: l.stripCode ?? undefined,
      stripAmount: num(l.stripAmount),
      stripHours: num(l.stripHours),
    })
  ),
  sundries: num(q.sundries),
  sundriesPercent: numOpt(q.sundriesPercent),
  consumables: num(q.consumables),
  partsTotal: num(q.partsTotal),
  outWorkTotal: num(q.outWorkTotal),
  panelTotal: num(q.panelTotal),
  paintTotal: num(q.paintTotal),
  stripTotal: num(q.stripTotal),
  labourTotal: num(q.labourTotal),
  totalHours: num(q.totalHours),
  subtotal: num(q.subtotal),
  vat: num(q.vat),
  total: num(q.total),
  notes: q.notes ?? undefined,
  estimatorName: q.estimatorName ?? undefined,
  pdfUrl: q.pdfUrl ?? undefined,
  createdAt: iso(q.createdAt),
  createdByName: q.createdByName ?? undefined,
  status: q.status as BuiltQuote["status"],
  acceptedAt: q.acceptedAt ? iso(q.acceptedAt) : undefined,
});

const toRequest = (r: RequestRow): QuoteRequest => {
  const requiredPhotos: RequiredPhotos = {};
  let discImage: MediaRef | undefined;
  let odometerImage: MediaRef | undefined;
  let video: MediaRef | undefined;
  const damagePhotos: MediaRef[] = [];

  for (const m of r.media) {
    const side = PHOTO_KIND[m.kind];
    if (side) requiredPhotos[side] = mediaRef(m);
    else if (m.kind === "disc") discImage = mediaRef(m);
    else if (m.kind === "odometer") odometerImage = mediaRef(m);
    else if (m.kind === "video") video = mediaRef(m);
    else if (m.kind === "damage") damagePhotos.push(mediaRef(m));
  }

  return {
    reference: r.reference,
    publicToken: r.publicToken ?? undefined,
    rateCardId: r.rateCardId ?? undefined,
    createdAt: iso(r.createdAt),
    status: r.status as RequestStatus,
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    phone: r.phone,
    companyName: r.companyName ?? undefined,
    hasInsurance: r.hasInsurance as QuoteRequest["hasInsurance"],
    insurerName: r.insurerName ?? undefined,
    insurerId: r.insurerId ?? undefined,
    underWarranty: r.underWarranty as QuoteRequest["underWarranty"],
    isInsuranceClaim: r.isInsuranceClaim as QuoteRequest["isInsuranceClaim"],
    claimNumber: r.claimNumber ?? undefined,
    noClaimNumberYet: r.noClaimNumberYet || undefined,
    isThirdPartyClaim: r.isThirdPartyClaim as QuoteRequest["isThirdPartyClaim"],
    suspectedEngineDamage: r.suspectedEngineDamage as QuoteRequest["suspectedEngineDamage"],
    quotesRequested: r.quotesRequested,
    vehicle: {
      vin: r.vin ?? undefined,
      make: r.make ?? undefined,
      model: r.model ?? undefined,
      series: r.series ?? undefined,
      year: r.year ?? undefined,
      colour: r.colour ?? undefined,
      registration: r.registration ?? undefined,
      discRawText: r.discRawText ?? undefined,
    },
    mileageKm: r.mileageKm ?? undefined,
    odometerImage,
    discImage,
    video,
    requiredPhotos,
    damagePhotos,
    repairerInitiated: r.repairerInitiated || undefined,
    location: r.lat !== null && r.lng !== null ? { lat: r.lat, lng: r.lng } : undefined,
    letUsChoose: r.letUsChoose,
    selectedPanelBeaterIds: r.selectedPanelBeaters.map((s) => s.panelBeaterId),
    quotes: r.quotes.map((q) => toQuote(q, r.reference)),
  };
};

const REQUEST_INCLUDE = {
  media: { orderBy: { sortOrder: "asc" } },
  selectedPanelBeaters: true,
  quotes: {
    include: { lines: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.QuoteRequestInclude;

/** A request with everything the app's QuoteRequest type needs. */
type RequestRow = Prisma.QuoteRequestGetPayload<{ include: typeof REQUEST_INCLUDE }>;
type QuoteRow = Prisma.QuoteGetPayload<{ include: { lines: true } }>;

export async function getRequest(ref: string): Promise<QuoteRequest | null> {
  const row = await getDb().quoteRequest.findUnique({
    where: { reference: ref },
    include: REQUEST_INCLUDE,
  });
  return row ? toRequest(row) : null;
}

/** Flatten the app's media fields into RequestMedia rows. */
function mediaRows(
  draft: Omit<QuoteRequest, "reference">
): Prisma.RequestMediaCreateWithoutRequestInput[] {
  const rows: Prisma.RequestMediaCreateWithoutRequestInput[] = [];
  const push = (kind: MediaKind, m: MediaRef | undefined, sortOrder = 0) => {
    if (m?.url) rows.push({ kind, url: m.url, pathname: m.pathname, contentType: m.contentType ?? null, sortOrder });
  };

  push("disc", draft.discImage);
  push("odometer", draft.odometerImage);
  push("video", draft.video);
  push("photo_front", draft.requiredPhotos?.front);
  push("photo_back", draft.requiredPhotos?.back);
  push("photo_left", draft.requiredPhotos?.left);
  push("photo_right", draft.requiredPhotos?.right);
  (draft.damagePhotos ?? []).forEach((m, i) => push("damage", m, i));

  return rows;
}

/**
 * Create a request, allocating a unique reference.
 *
 * The reference counter is incremented inside the database, and `reference`
 * carries a unique constraint — so concurrent submissions can neither collide
 * nor overwrite one another. On the rare clash we simply take the next number.
 */
export async function createRequest(
  draft: Omit<QuoteRequest, "reference">
): Promise<QuoteRequest> {
  const db = getDb();

  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = await nextReference(draft.lastName);
    try {
      const row = await db.quoteRequest.create({
        data: {
          reference,
          // Gates the consumer's own quote page. Random, because the reference
          // is derived from the date and their surname.
          publicToken: crypto.randomUUID(),
          rateCardId: draft.rateCardId ?? null,
          status: draft.status,
          firstName: draft.firstName,
          lastName: draft.lastName,
          email: draft.email,
          phone: draft.phone,
          companyName: draft.companyName ?? null,
          hasInsurance: draft.hasInsurance,
          insurerName: draft.insurerName ?? null,
          insurerId: draft.insurerId ?? null,
          underWarranty: draft.underWarranty,
          isInsuranceClaim: draft.isInsuranceClaim,
          claimNumber: draft.claimNumber ?? null,
          noClaimNumberYet: !!draft.noClaimNumberYet,
          isThirdPartyClaim: draft.isThirdPartyClaim,
          suspectedEngineDamage: draft.suspectedEngineDamage,
          quotesRequested: draft.quotesRequested,
          vin: draft.vehicle?.vin ?? null,
          make: draft.vehicle?.make ?? null,
          model: draft.vehicle?.model ?? null,
          series: draft.vehicle?.series ?? null,
          year: draft.vehicle?.year ?? null,
          colour: draft.vehicle?.colour ?? null,
          registration: draft.vehicle?.registration ?? null,
          discRawText: draft.vehicle?.discRawText ?? null,
          mileageKm: draft.mileageKm ?? null,
          repairerInitiated: !!draft.repairerInitiated,
          lat: draft.location?.lat ?? null,
          lng: draft.location?.lng ?? null,
          letUsChoose: !!draft.letUsChoose,
          createdAt: new Date(draft.createdAt),
          media: { create: mediaRows(draft) },
          selectedPanelBeaters: {
            create: (draft.selectedPanelBeaterIds ?? []).map((panelBeaterId) => ({
              panelBeaterId,
            })),
          },
        },
        include: REQUEST_INCLUDE,
      });
      return toRequest(row);
    } catch (err) {
      if (!isUniqueViolation(err, "reference")) throw err;
      // Reference taken — loop and take the next sequence number.
    }
  }
  throw new Error("Could not allocate a unique quote reference");
}

/** Update only the workflow status of a request. */
export async function updateRequestStatus(
  reference: string,
  status: RequestStatus
): Promise<void> {
  await getDb().quoteRequest.update({ where: { reference }, data: { status } });
}

/**
 * Insert or replace the quote a workshop has built for a request, then move the
 * request's status on. One quote per panel beater per request.
 */
export async function upsertQuote(reference: string, quote: BuiltQuote): Promise<void> {
  const db = getDb();

  await db.$transaction(async (tx) => {
    const request = await tx.quoteRequest.findUnique({
      where: { reference },
      select: { id: true, quotesRequested: true },
    });
    if (!request) throw new Error(`Request ${reference} not found`);

    const totals = {
      sundries: quote.sundries,
      sundriesPercent: quote.sundriesPercent ?? null,
      consumables: quote.consumables,
      partsTotal: quote.partsTotal,
      outWorkTotal: quote.outWorkTotal,
      panelTotal: quote.panelTotal,
      paintTotal: quote.paintTotal,
      stripTotal: quote.stripTotal,
      labourTotal: quote.labourTotal,
      totalHours: quote.totalHours,
      subtotal: quote.subtotal,
      vat: quote.vat,
      total: quote.total,
      notes: quote.notes ?? null,
      estimatorName: quote.estimatorName ?? null,
      pdfUrl: quote.pdfUrl ?? null,
      createdByName: quote.createdByName ?? null,
    };

    const saved = await tx.quote.upsert({
      where: {
        requestId_panelBeaterId: {
          requestId: request.id,
          panelBeaterId: quote.panelBeaterId,
        },
      },
      create: {
        id: quote.id,
        requestId: request.id,
        panelBeaterId: quote.panelBeaterId,
        createdAt: new Date(quote.createdAt),
        ...totals,
      },
      update: totals,
      select: { id: true },
    });

    // Lines are replaced wholesale — the builder posts the complete quote.
    await tx.quoteLineItem.deleteMany({ where: { quoteId: saved.id } });
    if (quote.lines.length) {
      await tx.quoteLineItem.createMany({
        data: quote.lines.map((l, i) => ({
          quoteId: saved.id,
          sortOrder: i,
          code: l.code ?? null,
          description: l.description,
          quantity: l.quantity,
          partsCost: l.partsCost ?? null,
          partsAmount: l.partsAmount,
          partId: l.partId ?? null,
          supplier: l.supplier ?? null,
          partNumber: l.partNumber ?? null,
          panelCode: l.panelCode ?? null,
          panelAmount: l.panelAmount,
          panelHours: l.panelHours,
          paintCode: l.paintCode ?? null,
          paintAmount: l.paintAmount,
          paintHours: l.paintHours,
          stripCode: l.stripCode ?? null,
          stripAmount: l.stripAmount,
          stripHours: l.stripHours,
        })),
      });
    }

    const quoteCount = await tx.quote.count({ where: { requestId: request.id } });
    await tx.quoteRequest.update({
      where: { id: request.id },
      data: {
        status: quoteCount >= request.quotesRequested ? "completed" : "in_progress",
      },
    });
  });
}

// ---- Dashboard / listing --------------------------------------------------

export interface RequestListRow {
  reference: string;
  createdAt: string;
  status: RequestStatus;
  firstName: string;
  lastName: string;
  email: string;
  make?: string;
  model?: string;
  year?: string;
  colour?: string;
  quotesRequested: number;
  quoteCount: number;
}

export interface RequestListOptions {
  page?: number;
  pageSize?: number;
  status?: RequestStatus;
  /** Matches reference, name, email or registration. */
  search?: string;
  /** Restrict to requests assigned to one workshop. */
  panelBeaterId?: string;
}

/**
 * One page of requests, filtered and sorted in the database.
 *
 * This replaces getAllRequests(), which fetched every request into memory and
 * could not survive a large table.
 */
export async function listRequests(
  options: RequestListOptions = {}
): Promise<{ rows: RequestListRow[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, options.pageSize ?? 50));
  const search = options.search?.trim();

  const where = {
    ...(options.status ? { status: options.status } : {}),
    ...(options.panelBeaterId
      ? { selectedPanelBeaters: { some: { panelBeaterId: options.panelBeaterId } } }
      : {}),
    ...(search
      ? {
          OR: [
            { reference: { contains: search, mode: "insensitive" as const } },
            { firstName: { contains: search, mode: "insensitive" as const } },
            { lastName: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { registration: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const db = getDb();
  const [rows, total] = await Promise.all([
    db.quoteRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        reference: true,
        createdAt: true,
        status: true,
        firstName: true,
        lastName: true,
        email: true,
        make: true,
        model: true,
        year: true,
        colour: true,
        quotesRequested: true,
        _count: { select: { quotes: true } },
      },
    }),
    db.quoteRequest.count({ where }),
  ]);

  return {
    rows: rows.map((r) => ({
      reference: r.reference,
      createdAt: iso(r.createdAt),
      status: r.status as RequestStatus,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      make: r.make ?? undefined,
      model: r.model ?? undefined,
      year: r.year ?? undefined,
      colour: r.colour ?? undefined,
      quotesRequested: r.quotesRequested,
      quoteCount: r._count.quotes,
    })),
    total,
    page,
    pageSize,
  };
}

export interface DashboardStats {
  total: number;
  inProgress: number;
  completed: number;
  totalExecuted: number;
}

/**
 * The dashboard's four cards, computed in the database. Previously this loaded
 * every request and every quote into memory to add them up.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const db = getDb();
  const [byStatus, total, executed] = await Promise.all([
    db.quoteRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    db.quoteRequest.count(),
    db.quote.aggregate({ _sum: { total: true } }),
  ]);

  const count = (s: RequestStatus) =>
    byStatus.find((g) => g.status === s)?._count._all ?? 0;

  return {
    total,
    inProgress: count("in_progress"),
    completed: count("completed"),
    totalExecuted: num(executed._sum.total),
  };
}

// ---- Rate cards -----------------------------------------------------------

const toRateCard = (r: {
  id: string;
  panelBeaterId: string;
  kind: string;
  insurerName: string | null;
  aluminium: boolean;
  createdAt: Date;
  values: { scope: string; field: string; value: DecimalLike }[];
}): RateCard => ({
  id: r.id,
  panelBeaterId: r.panelBeaterId,
  kind: r.kind as RateCardKind,
  insurerName: r.insurerName ?? undefined,
  aluminium: r.aluminium,
  values: toRateValues(r.values),
  createdAt: iso(r.createdAt),
});

/**
 * A workshop's own cards. Every card carries its own values, insurance ones
 * included — the rates in an insurer SLA are negotiated per repairer, so there
 * is nothing central to inherit from.
 */
export async function getRateCards(panelBeaterId: string): Promise<RateCard[]> {
  const rows = await getDb().rateCard.findMany({
    where: { panelBeaterId },
    include: { values: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toRateCard);
}

export async function getRateCard(id: string): Promise<RateCard | null> {
  const row = await getDb().rateCard.findUnique({ where: { id }, include: { values: true } });
  return row ? toRateCard(row) : null;
}

/** Create or update one card, replacing its values wholesale. */
export async function upsertRateCard(card: RateCard): Promise<void> {
  const db = getDb();
  await db.$transaction(async (tx) => {
    const data = {
      panelBeaterId: card.panelBeaterId,
      kind: card.kind,
      insurerName:
        card.kind === "insurance" ? card.insurerName?.trim() || null : null,
      aluminium: !!card.aluminium,
    };
    await tx.rateCard.upsert({
      where: { id: card.id },
      create: { id: card.id, ...data, createdAt: new Date(card.createdAt) },
      update: data,
    });

    await tx.rateCardValue.deleteMany({ where: { rateCardId: card.id } });
    const rows = fromRateValues(card.values ?? {});
    if (rows.length) {
      await tx.rateCardValue.createMany({
        data: rows.map((r) => ({ rateCardId: card.id, ...r })),
        skipDuplicates: true,
      });
    }
  });
}

export async function deleteRateCard(id: string): Promise<void> {
  await getDb().rateCard.delete({ where: { id } });
}

// ---- panel beater's own view ----------------------------------------------

export interface PanelBeaterWorkRow {
  reference: string;
  createdAt: string;
  requestStatus: RequestStatus;
  clientName: string;
  vehicle: string;
  registration?: string;
  isInsuranceClaim: boolean;
  /** Undefined when this workshop hasn't quoted the job yet. */
  quoteStatus?: QuoteStatus;
  quoteTotal?: number;
}

export interface PanelBeaterQuoteStats {
  totalQuotes: number;
  awaitingApproval: number;
  accepted: number;
}

/** The three cards on a panel beater's dashboard, counted in the database. */
export async function getPanelBeaterQuoteStats(
  panelBeaterId: string
): Promise<PanelBeaterQuoteStats> {
  const byStatus = await getDb().quote.groupBy({
    by: ["status"],
    where: { panelBeaterId },
    _count: { _all: true },
  });

  const count = (s: QuoteStatus) => byStatus.find((g) => g.status === s)?._count._all ?? 0;

  return {
    totalQuotes: byStatus.reduce((sum, g) => sum + g._count._all, 0),
    awaitingApproval: count("awaiting_approval"),
    accepted: count("accepted"),
  };
}

/**
 * Every request sent to this workshop, quoted or not — the dashboard doubles as
 * their to-do list, so a job they haven't priced yet still has to show up.
 */
export async function listPanelBeaterWork(
  panelBeaterId: string,
  options: { page?: number; pageSize?: number } = {}
): Promise<{ rows: PanelBeaterWorkRow[]; total: number }> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, options.pageSize ?? 50));
  const where = { selectedPanelBeaters: { some: { panelBeaterId } } };

  const db = getDb();
  const [rows, total] = await Promise.all([
    db.quoteRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        reference: true,
        createdAt: true,
        status: true,
        firstName: true,
        lastName: true,
        make: true,
        model: true,
        year: true,
        registration: true,
        isInsuranceClaim: true,
        // Only THIS workshop's quote — a panel beater must never see what a
        // competitor quoted on the same job.
        quotes: {
          where: { panelBeaterId },
          select: { status: true, total: true },
          take: 1,
        },
      },
    }),
    db.quoteRequest.count({ where }),
  ]);

  return {
    total,
    rows: rows.map((r) => {
      const own = r.quotes[0];
      return {
        reference: r.reference,
        createdAt: iso(r.createdAt),
        requestStatus: r.status as RequestStatus,
        clientName: `${r.firstName} ${r.lastName}`.trim(),
        vehicle: [r.make, r.model, r.year].filter(Boolean).join(" "),
        registration: r.registration ?? undefined,
        isInsuranceClaim: r.isInsuranceClaim === "yes",
        quoteStatus: own ? (own.status as QuoteStatus) : undefined,
        quoteTotal: own ? num(own.total) : undefined,
      };
    }),
  };
}

// ---- consumer's own quote page --------------------------------------------

/** Look a request up by the token in the consumer's emailed link. */
export async function getRequestByPublicToken(token: string): Promise<QuoteRequest | null> {
  if (!token) return null;
  const row = await getDb().quoteRequest.findUnique({
    where: { publicToken: token },
    include: REQUEST_INCLUDE,
  });
  return row ? toRequest(row) : null;
}

/**
 * The consumer picks one quote. Accepting is exclusive — every other quote on
 * the same request is declined in the same transaction, so two workshops can
 * never both believe they won. Re-accepting the one already accepted is a
 * no-op; switching to a different one is allowed and moves the acceptance.
 */
export async function acceptQuote(
  token: string,
  quoteId: string
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "wrong_request" }> {
  const db = getDb();

  return db.$transaction(async (tx) => {
    const request = await tx.quoteRequest.findUnique({
      where: { publicToken: token },
      select: { id: true },
    });
    if (!request) return { ok: false as const, reason: "not_found" as const };

    const quote = await tx.quote.findUnique({
      where: { id: quoteId },
      select: { id: true, requestId: true },
    });
    if (!quote) return { ok: false as const, reason: "not_found" as const };
    // The token proves which request they own; it must match the quote they
    // named, or a valid token could accept a quote on somebody else's job.
    if (quote.requestId !== request.id)
      return { ok: false as const, reason: "wrong_request" as const };

    await tx.quote.updateMany({
      where: { requestId: request.id, id: { not: quoteId } },
      data: { status: "declined", acceptedAt: null },
    });
    await tx.quote.update({
      where: { id: quoteId },
      data: { status: "accepted", acceptedAt: new Date() },
    });

    return { ok: true as const };
  });
}

// ---- Dev planner -----------------------------------------------------------

type DevAttachmentRow = {
  id: string;
  fileName: string;
  url: string;
  pathname: string;
  contentType: string | null;
  size: number | null;
  createdAt: Date;
};

type DevTicketRow = {
  id: string;
  title: string;
  detail: string | null;
  priority: DevPriority;
  status: DevTicketStatus;
  remindOn: Date | null;
  reminderSentAt: Date | null;
  createdById: string | null;
  createdByName: string;
  createdByEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  attachments?: DevAttachmentRow[];
  notes?: DevNoteRow[];
};

type DevNoteRow = {
  id: string;
  body: string;
  createdById: string | null;
  createdByName: string;
  createdByEmail: string | null;
  createdAt: Date;
};

const toDevNote = (r: DevNoteRow): DevTicketNote => ({
  id: r.id,
  body: r.body,
  createdById: r.createdById ?? undefined,
  createdByName: r.createdByName,
  createdByEmail: r.createdByEmail ?? undefined,
  createdAt: iso(r.createdAt),
});

const toDevAttachment = (r: DevAttachmentRow): DevTicketAttachment => ({
  id: r.id,
  fileName: r.fileName,
  url: r.url,
  pathname: r.pathname,
  contentType: r.contentType ?? undefined,
  size: r.size ?? undefined,
  createdAt: iso(r.createdAt),
});

const toDevTicket = (r: DevTicketRow): DevTicket => ({
  id: r.id,
  title: r.title,
  detail: r.detail ?? undefined,
  priority: r.priority,
  status: r.status,
  remindOn: dateOnly(r.remindOn),
  reminderSentAt: r.reminderSentAt ? iso(r.reminderSentAt) : undefined,
  createdById: r.createdById ?? undefined,
  createdByName: r.createdByName,
  createdByEmail: r.createdByEmail ?? undefined,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
  completedAt: r.completedAt ? iso(r.completedAt) : undefined,
  attachments: (r.attachments ?? []).map(toDevAttachment),
  notes: (r.notes ?? []).map(toDevNote),
});

/**
 * Everything a ticket card needs in one go. Oldest note first so the thread
 * reads top-to-bottom like a conversation.
 */
const DEV_TICKET_INCLUDE = {
  attachments: { orderBy: { createdAt: "asc" } },
  notes: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.DevTicketInclude;

/**
 * Urgent first, then the committed work, then the wishlist. Within a priority
 * the oldest ticket leads — something logged three weeks ago should not sink
 * below today's, which is how a backlog quietly rots.
 */
const DEV_TICKET_ORDER: Prisma.DevTicketOrderByWithRelationInput[] = [
  { priority: "asc" }, // enum order: urgent, must_do, nice_to_have
  { createdAt: "asc" },
];

/** Midnight UTC today — the cut-off at which an unmet reminder date is overdue. */
function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function listDevTickets(opts?: {
  status?: DevTicketStatus;
  priority?: DevPriority;
  search?: string;
}): Promise<DevTicket[]> {
  const where: Prisma.DevTicketWhereInput = {};
  if (opts?.status) where.status = opts.status;
  if (opts?.priority) where.priority = opts.priority;
  if (opts?.search) {
    where.OR = [
      { title: { contains: opts.search, mode: "insensitive" } },
      { detail: { contains: opts.search, mode: "insensitive" } },
    ];
  }

  const rows = await getDb().devTicket.findMany({
    where,
    orderBy: DEV_TICKET_ORDER,
    include: DEV_TICKET_INCLUDE,
  });
  return rows.map(toDevTicket);
}

export async function getDevTicket(id: string): Promise<DevTicket | null> {
  const row = await getDb().devTicket.findUnique({
    where: { id },
    include: DEV_TICKET_INCLUDE,
  });
  return row ? toDevTicket(row) : null;
}

/**
 * The four cards. Every count except `done` is of OPEN tickets, so finishing
 * work makes the numbers fall. A "total in pipeline" that counted completed
 * items too would only ever climb, and would stop meaning anything.
 */
export async function getDevTicketStats(): Promise<DevTicketStats> {
  const db = getDb();
  const open: Prisma.DevTicketWhereInput = { status: { not: "done" } };

  const [byPriority, openTotal, done, overdue] = await Promise.all([
    db.devTicket.groupBy({ by: ["priority"], where: open, _count: { _all: true } }),
    db.devTicket.count({ where: open }),
    db.devTicket.count({ where: { status: "done" } }),
    db.devTicket.count({ where: { ...open, remindOn: { lt: startOfToday() } } }),
  ]);

  const count = (p: DevPriority) =>
    byPriority.find((g) => g.priority === p)?._count._all ?? 0;

  return {
    open: openTotal,
    urgent: count("urgent"),
    mustDo: count("must_do"),
    niceToHave: count("nice_to_have"),
    done,
    overdue,
  };
}

export async function createDevTicket(input: {
  title: string;
  detail?: string;
  priority: DevPriority;
  status?: DevTicketStatus;
  remindOn?: string;
  createdById?: string;
  createdByName: string;
  createdByEmail?: string;
  attachments?: DevAttachmentInput[];
}): Promise<DevTicket> {
  const status = input.status ?? "backlog";
  const row = await getDb().devTicket.create({
    data: {
      title: input.title,
      detail: input.detail ?? null,
      priority: input.priority,
      status,
      remindOn: toDate(input.remindOn),
      completedAt: status === "done" ? new Date() : null,
      createdById: input.createdById ?? null,
      createdByName: input.createdByName,
      createdByEmail: input.createdByEmail ?? null,
      attachments: input.attachments?.length
        ? { create: input.attachments.map(attachmentData) }
        : undefined,
    },
    include: DEV_TICKET_INCLUDE,
  });
  return toDevTicket(row);
}

export async function updateDevTicket(
  id: string,
  patch: {
    title?: string;
    detail?: string;
    priority?: DevPriority;
    status?: DevTicketStatus;
    remindOn?: string | null;
  }
): Promise<DevTicket | null> {
  const db = getDb();
  const existing = await db.devTicket.findUnique({ where: { id } });
  if (!existing) return null;

  const data: Prisma.DevTicketUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.detail !== undefined) data.detail = patch.detail || null;
  if (patch.priority !== undefined) data.priority = patch.priority;

  // Moving the date re-arms the reminder: a date you have just changed is one
  // you want to hear about, even if the previous one had already fired.
  if (patch.remindOn !== undefined) {
    const next = patch.remindOn ? new Date(patch.remindOn) : null;
    data.remindOn = next;
    if (dateOnly(next) !== dateOnly(existing.remindOn)) data.reminderSentAt = null;
  }

  if (patch.status !== undefined) {
    data.status = patch.status;
    // completedAt records the first time it was finished; re-opening clears it,
    // so a ticket can never read as both open and completed.
    if (patch.status === "done") {
      if (!existing.completedAt) data.completedAt = new Date();
    } else {
      data.completedAt = null;
    }
  }

  const row = await db.devTicket.update({
    where: { id },
    data,
    include: DEV_TICKET_INCLUDE,
  });
  return toDevTicket(row);
}

/**
 * Removes the ticket and (by cascade) its attachment rows, returning those rows
 * so the caller can bin the blob bytes too.
 */
export async function deleteDevTicket(id: string): Promise<DevTicketAttachment[]> {
  const db = getDb();
  const row = await db.devTicket.findUnique({
    where: { id },
    include: { attachments: true },
  });
  if (!row) return [];
  await db.devTicket.delete({ where: { id } });
  return row.attachments.map(toDevAttachment);
}

export async function addDevTicketAttachments(
  ticketId: string,
  files: DevAttachmentInput[]
): Promise<DevTicket | null> {
  const db = getDb();
  const exists = await db.devTicket.findUnique({
    where: { id: ticketId },
    select: { id: true },
  });
  if (!exists) return null;

  await db.devTicketAttachment.createMany({
    data: files.map((f) => ({ ticketId, ...attachmentData(f) })),
  });
  return getDevTicket(ticketId);
}

/**
 * Adds a note to a ticket. The author is passed in from the SESSION by the
 * route — never from the request body — and `createdByName` is stored as a
 * verbatim copy so a deleted user doesn't erase who said what.
 */
export async function addDevTicketNote(
  ticketId: string,
  note: {
    body: string;
    createdById?: string;
    createdByName: string;
    createdByEmail?: string;
  }
): Promise<DevTicket | null> {
  const db = getDb();
  const exists = await db.devTicket.findUnique({
    where: { id: ticketId },
    select: { id: true },
  });
  if (!exists) return null;

  await db.devTicketNote.create({
    data: {
      ticketId,
      body: note.body,
      createdById: note.createdById ?? null,
      createdByName: note.createdByName,
      createdByEmail: note.createdByEmail ?? null,
    },
  });
  return getDevTicket(ticketId);
}

/**
 * Removes one note and hands back the ticket it belonged to. Returns null if
 * the note is already gone, so a double-click can't 500.
 */
export async function deleteDevTicketNote(noteId: string): Promise<DevTicket | null> {
  const db = getDb();
  const row = await db.devTicketNote.findUnique({
    where: { id: noteId },
    select: { ticketId: true },
  });
  if (!row) return null;

  await db.devTicketNote.delete({ where: { id: noteId } });
  return getDevTicket(row.ticketId);
}

/** Detaches one file, returning it so the caller can bin the bytes. */
export async function removeDevTicketAttachment(
  attachmentId: string
): Promise<DevTicketAttachment | null> {
  const db = getDb();
  const row = await db.devTicketAttachment.findUnique({ where: { id: attachmentId } });
  if (!row) return null;
  await db.devTicketAttachment.delete({ where: { id: attachmentId } });
  return toDevAttachment(row);
}

/**
 * Tickets whose reminder has come due and has not been sent. Anything dated on
 * or before today qualifies, so one that fell over a weekend — or during an
 * outage — is still chased rather than silently skipped.
 */
export async function listDueDevReminders(now: Date): Promise<DevTicket[]> {
  const endOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59)
  );
  const rows = await getDb().devTicket.findMany({
    where: {
      status: { not: "done" },
      reminderSentAt: null,
      remindOn: { not: null, lte: endOfToday },
    },
    orderBy: DEV_TICKET_ORDER,
    include: DEV_TICKET_INCLUDE,
  });
  return rows.map(toDevTicket);
}

export async function markDevReminderSent(id: string): Promise<void> {
  await getDb().devTicket.update({
    where: { id },
    data: { reminderSentAt: new Date() },
  });
}

// ---- helpers ---------------------------------------------------------------

/** A file on its way to a ticket, before it becomes a row. */
type DevAttachmentInput = {
  fileName: string;
  url: string;
  pathname: string;
  contentType?: string;
  size?: number;
};

const attachmentData = (a: DevAttachmentInput) => ({
  fileName: a.fileName,
  url: a.url,
  pathname: a.pathname,
  contentType: a.contentType ?? null,
  size: a.size ?? null,
});

/** The interactive-transaction client Prisma hands to $transaction callbacks. */
type TxClient = Parameters<Parameters<ReturnType<typeof getDb>["$transaction"]>[0]>[0];

/** True when `err` is a Postgres unique-constraint violation on `field`. */
function isUniqueViolation(err: unknown, field: string): boolean {
  const e = err as { code?: string; meta?: { target?: unknown } };
  if (e?.code !== "P2002") return false;
  const target = e.meta?.target;
  if (Array.isArray(target)) return target.includes(field);
  return typeof target === "string" ? target.includes(field) : true;
}

// ---- Integration secrets ---------------------------------------------------

/**
 * Third-party API keys entered in the portal. The plaintext key never touches
 * this table — `lib/secrets.ts` seals it first — because Power BI reads this
 * database directly.
 */
export async function setIntegrationSecret(
  id: string,
  sealed: SealedSecret & { masked: string; clientId?: string },
  updatedByName?: string
): Promise<void> {
  const data = {
    clientId: sealed.clientId ?? null,
    ciphertext: sealed.ciphertext,
    iv: sealed.iv,
    authTag: sealed.authTag,
    masked: sealed.masked,
    updatedByName: updatedByName ?? null,
  };
  await getDb().integrationSecret.upsert({
    where: { id },
    create: { id, ...data },
    update: data,
  });
}

/** What the Integrations page may show without a password: never the key. */
export async function getIntegrationSecretMeta(
  id: string
): Promise<{
  masked: string;
  clientId?: string;
  updatedByName?: string;
  updatedAt: string;
} | null> {
  const row = await getDb().integrationSecret.findUnique({ where: { id } });
  if (!row) return null;
  return {
    masked: row.masked,
    clientId: row.clientId ?? undefined,
    updatedByName: row.updatedByName ?? undefined,
    updatedAt: iso(row.updatedAt),
  };
}

/**
 * Both halves of the pair, for the server-side caller that will actually talk
 * to imagin8. Returns null when there is no usable key.
 */
export async function getIntegrationCredentials(
  id: string
): Promise<{ clientId?: string; key: string } | null> {
  const row = await getDb().integrationSecret.findUnique({ where: { id } });
  if (!row) return null;
  const key = decryptSecret(row);
  if (key === null) return null;
  return { clientId: row.clientId ?? undefined, key };
}

/**
 * The decrypted key, for server-side use only. Returns null when unset OR when
 * the stored value can no longer be decrypted (a rotated SESSION_SECRET) — the
 * caller cannot tell the difference and does not need to; the Integrations page
 * reports the distinction to the admin.
 */
export async function getIntegrationKey(id: string): Promise<string | null> {
  const row = await getDb().integrationSecret.findUnique({ where: { id } });
  if (!row) return null;
  return decryptSecret(row);
}

export async function deleteIntegrationSecret(id: string): Promise<void> {
  await getDb().integrationSecret.deleteMany({ where: { id } });
}

// ---- VIN lookup cache ------------------------------------------------------

/**
 * imagin8 bills per transaction, so every decode is cached — including a MISS,
 * or an undecodable VIN would be re-billed on every page load.
 */
export async function getCachedVin(vin: string): Promise<VinLookupResult | null> {
  const row = await getDb().vinLookup.findUnique({ where: { vin: vin.toUpperCase() } });
  if (!row) return null;
  return {
    vin: row.vin,
    found: row.found,
    make: row.make ?? undefined,
    model: row.model ?? undefined,
    series: row.series ?? undefined,
    year: row.year ?? undefined,
    mmCode: row.mmCode ?? undefined,
    retailValue: numOpt(row.retailValue),
    tradeValue: numOpt(row.tradeValue),
    marketValue: numOpt(row.marketValue),
    fetchedAt: iso(row.fetchedAt),
  };
}

export async function cacheVin(
  result: VinLookupResult,
  raw?: unknown
): Promise<void> {
  const vin = result.vin.toUpperCase();
  const data = {
    found: result.found,
    make: result.make ?? null,
    model: result.model ?? null,
    series: result.series ?? null,
    year: result.year ?? null,
    mmCode: result.mmCode ?? null,
    retailValue: result.retailValue ?? null,
    tradeValue: result.tradeValue ?? null,
    marketValue: result.marketValue ?? null,
    raw: (raw ?? undefined) as Prisma.InputJsonValue | undefined,
    fetchedAt: new Date(),
  };
  await getDb().vinLookup.upsert({
    where: { vin },
    create: { vin, ...data },
    update: data,
  });
}
