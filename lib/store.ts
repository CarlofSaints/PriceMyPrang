import { getDb } from "./db";
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
  active: boolean;
  createdAt: Date;
}): Supplier => ({
  id: r.id,
  name: r.name,
  partTypes: r.partTypes as PartType[],
  makes: r.makes,
  supplies: r.supplies ?? undefined,
  email: r.email ?? undefined,
  phone: r.phone ?? undefined,
  active: r.active,
  createdAt: iso(r.createdAt),
});

export async function getSuppliers(): Promise<Supplier[]> {
  const rows = await getDb().supplier.findMany({ orderBy: { name: "asc" } });
  return rows.map(toSupplier);
}

export async function saveSuppliers(suppliers: Supplier[]): Promise<void> {
  const db = getDb();
  await db.$transaction(async (tx) => {
    for (const s of suppliers) {
      const data = {
        name: s.name,
        partTypes: s.partTypes,
        makes: s.makes,
        supplies: s.supplies ?? null,
        email: s.email ?? null,
        phone: s.phone ?? null,
        active: s.active,
      };
      await tx.supplier.upsert({
        where: { id: s.id },
        create: { id: s.id, ...data, createdAt: new Date(s.createdAt) },
        update: data,
      });
    }
    await tx.supplier.deleteMany({ where: { id: { notIn: suppliers.map((s) => s.id) } } });
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
    supplies: supplier.supplies ?? null,
    email: supplier.email ?? null,
    phone: supplier.phone ?? null,
    active: supplier.active,
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
  consumables: num(q.consumables),
  partsTotal: num(q.partsTotal),
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
      consumables: quote.consumables,
      partsTotal: quote.partsTotal,
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

// ---- helpers ---------------------------------------------------------------

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
