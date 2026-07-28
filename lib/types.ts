// ---------------------------------------------------------------------------
// Price my Prang — shared data types (stored as JSON in Vercel Blob)
// ---------------------------------------------------------------------------

export type Permission =
  | "manage_roles"
  | "manage_insurers" // Super Admin: add insurance companies + set their rates
  | "manage_users"
  | "manage_panel_beaters"
  | "onboard_self" // a panel beater editing their own listing
  | "view_dashboard"
  | "build_quotes"
  | "manage_parts";

// Roles are DATA (created/edited in the portal), not hardcoded.
export interface Role {
  id: string; // stable key, e.g. "admin" or a uuid
  name: string; // display label
  permissions: Permission[];
  /** Built-in role that can't be deleted/edited (the Admin superuser). */
  system?: boolean;
}

/** A role id (kept as a string alias so existing call sites still compile). */
export type RoleName = string;

// ---------------------------------------------------------------------------
// Rate types — DATA, created by Super Admins. Each becomes a row on the panel
// beater Rates page. Panel beaters set a value per active rate type.
// ---------------------------------------------------------------------------
export type RateUnit = "rand_per_hour" | "rand" | "percent";

/**
 * Values on a rate card, grouped by block. Field keys come from the fixed
 * catalogue in lib/rateCard.ts — rate types are no longer data.
 */
export type RateValues = Partial<Record<RateScope, Record<string, number>>>;

export type RateScope = "in_warranty" | "out_of_warranty" | "aluminium" | "general";

export type RateCardKind = "cash" | "insurance";

/**
 * One set of rates a workshop quotes on: their cash rates (the client pays
 * directly), or an insurer's. An insurance card carries no values of its own —
 * it inherits the central card a Super Admin sets on the Insurers page.
 */
export interface RateCard {
  id: string;
  panelBeaterId: string;
  kind: RateCardKind;
  /** Set only when kind is "insurance". */
  insurerId?: string;
  /** Whether the optional aluminium block applies. */
  aluminium: boolean;
  values: RateValues;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Insurance companies — created by Super Admins, with a shared rate card that
// ALL panel beaters can see/use. Consumers pick their insurer from a dropdown.
// ---------------------------------------------------------------------------
export interface InsuranceCompany {
  id: string;
  name: string;
  active: boolean;
  /** Whether this insurer's card includes the optional aluminium block. */
  aluminium: boolean;
  /** The central card every workshop's insurance card for this insurer inherits. */
  rates: RateValues;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  /** The id of the Role assigned to this user. */
  role: string;
  /** If this user is a panel beater login, the panel beater they own. */
  panelBeaterId?: string;
  active: boolean;
  /** True while the user is still on an admin-issued temporary password. */
  mustChangePassword?: boolean;
  createdAt: string;
}

/** A logged-in user with their role's permissions resolved. */
export interface AuthUser extends User {
  permissions: Permission[];
  roleName: string;
}

export interface WarrantyApproval {
  manufacturer: string;
  startDate?: string; // yyyy-mm-dd
  expiryDate?: string; // yyyy-mm-dd
  certificate?: MediaRef;
  remind?: boolean;
  /** Reminder milestones already emailed: "3m","2m","1m","2w","1d". */
  remindersSent?: string[];
}

export interface PanelBeater {
  id: string;
  // Who filled the form / who owns the business
  completedByName?: string;
  completedByEmail?: string;
  ownerName?: string;
  ownerEmail?: string;

  companyName: string; // mandatory
  tradingAs?: string;
  companyRegNumber: string; // mandatory
  vatNumber?: string;
  physicalAddress: string; // mandatory — geocoded for the map
  lat?: number;
  lng?: number;
  mibcoNumber?: string;
  rmiNumber: string; // mandatory
  sambraNumber?: string;
  miwaNumber?: string;
  labourRateSenior?: number;
  labourRateJunior?: number;
  // Rates live on RateCard rows now — a workshop has several (cash, plus one
  // per insurer), not a single flat card.
  logoUrl?: string;
  email?: string;
  phone?: string;
  /** Manufacturers this workshop is an approved warranty supplier for. */
  warranties?: WarrantyApproval[];
  active: boolean;
  /** Approval workflow. Public self-registrations start as "pending". */
  status?: "pending" | "approved" | "declined";
  /** True when submitted via the public "Become a registered panel beater" form. */
  submittedByPublic?: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Suppliers — a curated list of parts suppliers (not a catalogue of parts).
// Each supplier records which part types they carry, the makes they cover, and
// a free-text note of what they supply.
// ---------------------------------------------------------------------------
export type PartType = "new" | "used" | "alternate";

export const PART_TYPES: { value: PartType; label: string }[] = [
  { value: "new", label: "New" },
  { value: "used", label: "Used" },
  { value: "alternate", label: "Alternate" },
];

export interface Supplier {
  id: string;
  name: string;
  /** Which kinds of parts they supply. */
  partTypes: PartType[];
  /** Vehicle makes they cover (e.g. Toyota, BMW), or "All". */
  makes: string[];
  /** Free text: what they supply (categories, notes). */
  supplies?: string;
  email?: string;
  phone?: string;
  active: boolean;
  createdAt: string;
}

export type YesNo = "yes" | "no";
export type YesNoUnsure = "yes" | "no" | "unsure";

export interface MediaRef {
  url: string;
  pathname: string;
  contentType?: string;
}

/** The four full-vehicle photos most insurers require, one per side. */
export type PhotoSide = "front" | "back" | "left" | "right";
export type RequiredPhotos = Partial<Record<PhotoSide, MediaRef>>;

export interface VehicleDetails {
  vin?: string;
  make?: string; // from disc / VIN
  model?: string;
  series?: string;
  year?: string;
  colour?: string;
  registration?: string;
  /** Raw text Claude read off the licence disc, for the assessor. */
  discRawText?: string;
}

export type RequestStatus = "new" | "in_progress" | "completed";

export interface QuoteRequest {
  reference: string; // PMP-YYYYMMDD-SURNAME-#
  /** Unguessable key for the consumer's own quote page. Never show this in the portal. */
  publicToken?: string;
  /** Rate card the repairer priced this job against. */
  rateCardId?: string;
  createdAt: string;
  status: RequestStatus;

  // Consumer answers
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** Optional — for self- or partially-insured businesses quoting under a company. */
  companyName?: string;
  hasInsurance: YesNo;
  /** Insurer name (from the dropdown or free text), captured when hasInsurance = "yes". */
  insurerName?: string;
  /** Id of the chosen InsuranceCompany, when picked from the dropdown (not "Other"). */
  insurerId?: string;
  underWarranty: YesNoUnsure;
  isInsuranceClaim: YesNo;
  /** Claim number, captured when isInsuranceClaim = "yes". */
  claimNumber?: string;
  /** True when it's an insurance claim but the client has no claim number yet. */
  noClaimNumberYet?: boolean;
  isThirdPartyClaim: YesNo;
  suspectedEngineDamage: YesNo;
  quotesRequested: number; // 1+

  vehicle: VehicleDetails;

  /** Odometer reading in kilometres (typed by the consumer, optionally OCR-read). */
  mileageKm?: number;
  /** Photo of the odometer as proof of mileage. */
  odometerImage?: MediaRef;

  discImage?: MediaRef;
  video?: MediaRef;
  /** The four mandatory full-vehicle photos (front/back/left/right). */
  requiredPhotos: RequiredPhotos;
  /** Optional extra close-ups of the damage. */
  damagePhotos: MediaRef[];

  /** True when a panel beater started this quote themselves (not a consumer). */
  repairerInitiated?: boolean;

  // Location + chosen panel beaters
  location?: { lat: number; lng: number };
  /** True when the client asked us to pick the workshops for them. */
  letUsChoose?: boolean;
  selectedPanelBeaterIds: string[];

  // Quotes built by assessors (one per selected panel beater)
  quotes: BuiltQuote[];
}

/** Suggested CODE values for a quote line (free text — not enforced). */
export const QUOTE_LINE_CODES = [
  "New",
  "Alt",
  "Used",
  "Repair",
  "Out Work",
  "Paint",
  "Note",
] as const;

export interface QuoteLineItem {
  /** Category code: New / Alt / Used / Repair / Out Work / Paint / Note (free text). */
  code?: string;
  description: string;
  quantity: number;
  /** Parts cost (Rand) for this line. */
  partsAmount: number;

  // Optional parts-catalogue link (from the parts picker).
  partId?: string;
  supplier?: string;
  partNumber?: string;

  // Panel beating work on this line.
  panelCode?: string;
  panelAmount: number;
  panelHours: number;

  // Paint work on this line.
  paintCode?: string;
  paintAmount: number;
  paintHours: number;

  // Strip & assemble work on this line.
  stripCode?: string;
  stripAmount: number;
  stripHours: number;
}

export interface BuiltQuote {
  id: string;
  reference: string;
  panelBeaterId: string;
  lines: QuoteLineItem[];

  sundries: number;
  consumables: number;

  partsTotal: number;
  panelTotal: number;
  paintTotal: number;
  stripTotal: number;
  labourTotal: number; // panel + paint + strip
  totalHours: number;

  subtotal: number; // parts + labour + sundries + consumables (ex VAT)
  vat: number;
  total: number; // incl VAT

  notes?: string;
  estimatorName?: string;
  pdfUrl?: string;
  createdAt: string;
  createdByName?: string;

  /**
   * Where this quote stands with the CONSUMER — they accept one, which declines
   * the rest. Not to be confused with PanelBeater.status, which is whether
   * we've vetted the workshop.
   */
  status: QuoteStatus;
  acceptedAt?: string;
}

export type QuoteStatus = "awaiting_approval" | "accepted" | "declined";
