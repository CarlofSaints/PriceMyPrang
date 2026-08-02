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
  | "manage_parts"
  | "manage_dev_tickets" // Super Admin: the dev planner
  | "manage_integrations" // Super Admin: third-party API keys (imagin8 VIN lookup)
  // A workshop's OWN supplier book. Deliberately two permissions: the buyer
  // maintains it, the estimator only needs to read it while quoting.
  | "manage_own_suppliers"
  | "view_own_suppliers"
  // Complaints. A workshop sees only its own; PMP staff see every one.
  | "manage_own_complaints"
  | "manage_complaints";

/**
 * Whose org chart a role belongs to. "platform" roles are PMP's own staff;
 * "panel_beater" roles are a workshop's team, and are the only ones a workshop
 * admin may assign.
 */
export type RoleScope = "platform" | "panel_beater";

// Roles are DATA (created/edited in the portal), not hardcoded.
export interface Role {
  id: string; // stable key, e.g. "admin" or a uuid
  name: string; // display label
  permissions: Permission[];
  /** Built-in role that can't be deleted/edited (the Admin superuser). */
  system?: boolean;
  scope: RoleScope;
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
 * directly), or the rates they've agreed with a particular insurer.
 *
 * Every repairer negotiates its own SLA, so two workshops on the same street
 * hold different numbers for the same insurer. That's why the insurer is a
 * free-text name on the card rather than a link to a centrally-priced one.
 */
export interface RateCard {
  id: string;
  panelBeaterId: string;
  kind: RateCardKind;
  /** Free-text insurance company name. Set only when kind is "insurance". */
  insurerName?: string;
  /** Whether the optional aluminium block applies. */
  aluminium: boolean;
  values: RateValues;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Insurance companies — the list a CONSUMER picks from when requesting a quote.
// Deliberately no rate card: rates are negotiated per repairer and live on that
// workshop's RateCard, so there is no central rate for an insurer.
// ---------------------------------------------------------------------------
export interface InsuranceCompany {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// The repairer agreement (T&Cs / NDA / SLA). A Super Admin uploads the .docx;
// exactly one document is active, and each repairer signs a specific version.
// ---------------------------------------------------------------------------
export interface AgreementDocument {
  id: string;
  title: string;
  /** HTML converted from the .docx, rendered on the signing page. */
  html: string;
  /** The original file, so the source of truth stays downloadable. */
  sourceUrl: string;
  sourcePathname: string;
  active: boolean;
  uploadedByName?: string;
  createdAt: string;
}

export interface RepairerAgreement {
  id: string;
  panelBeaterId: string;
  documentId: string;
  token: string;
  sentToName: string;
  sentToEmail: string;
  /** Unsigned until this is set — that's what makes it an agreement. */
  signedAt?: string;
  signerName?: string;
  signerTitle?: string;
  signerIp?: string;
  signerUserAgent?: string;
  pdfUrl?: string;
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
  /** When they proved they control this address. Undefined = unverified. */
  emailVerifiedAt?: string;
  /** Second factor by emailed one-time code. Opt-in per user. */
  twoFactorEnabled?: boolean;
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
  /** Undefined = Price my Prang's own list; set = private to that workshop. */
  panelBeaterId?: string;
  name: string;
  /** Which kinds of parts they supply. */
  partTypes: PartType[];
  /** Vehicle makes they cover (e.g. Toyota, BMW), or "All". */
  makes: string[];
  /** Free text: what they supply (categories, notes). */
  supplies?: string;
  email?: string;
  phone?: string;

  companyRegNumber?: string;
  vatNumber?: string;
  address?: string;

  mainContactName?: string;
  mainContactPhone?: string;
  mainContactEmail?: string;

  billingContactName?: string;
  billingContactPhone?: string;
  billingContactEmail?: string;

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

/**
 * A VIN decoded by imagin8. `found: false` is a real, cached answer — the
 * vendor had no record — not an error, so an undecodable VIN isn't re-billed
 * on every page load.
 */
export interface VinLookupResult {
  vin: string;
  found: boolean;
  make?: string;
  model?: string;
  series?: string;
  year?: string;
  /** Mead & McGrouther code. */
  mmCode?: string;
  retailValue?: number;
  tradeValue?: number;
  marketValue?: number;
  fetchedAt?: string;
}

// ---------------------------------------------------------------------------
// Consumer QC. A RATING is public; a COMPLAINT never is. They are deliberately
// separate records — a comment left with a rating is not a complaint.
// ---------------------------------------------------------------------------

export type ComplaintCategory =
  | "workmanship"
  | "paint"
  | "parts"
  | "delays"
  | "billing"
  | "conduct"
  | "other";

export type ComplaintStatus = "new" | "acknowledged" | "with_repairer" | "resolved" | "closed";
export type VehicleSafety = "safe" | "unsafe" | "unsure";
export type ComplaintOutcome = "rework" | "refund" | "explanation" | "other";

export const COMPLAINT_CATEGORIES: ComplaintCategory[] = [
  "workmanship",
  "paint",
  "parts",
  "delays",
  "billing",
  "conduct",
  "other",
];

export const COMPLAINT_CATEGORY_LABEL: Record<ComplaintCategory, string> = {
  workmanship: "Quality of the repair",
  paint: "Paintwork",
  parts: "Parts used",
  delays: "Delays / time taken",
  billing: "Billing or cost",
  conduct: "Staff conduct or service",
  other: "Something else",
};

export const COMPLAINT_STATUSES: ComplaintStatus[] = [
  "new",
  "acknowledged",
  "with_repairer",
  "resolved",
  "closed",
];

export const COMPLAINT_STATUS_LABEL: Record<ComplaintStatus, string> = {
  new: "New",
  acknowledged: "Acknowledged",
  with_repairer: "With the repairer",
  resolved: "Resolved",
  closed: "Closed",
};

export const VEHICLE_SAFETY_LABEL: Record<VehicleSafety, string> = {
  safe: "Yes, it's driveable",
  unsafe: "No — I don't think it's safe",
  unsure: "I'm not sure",
};

export const COMPLAINT_OUTCOMES: ComplaintOutcome[] = [
  "rework",
  "refund",
  "explanation",
  "other",
];

export const COMPLAINT_OUTCOME_LABEL: Record<ComplaintOutcome, string> = {
  rework: "I want the work put right",
  refund: "I want money back",
  explanation: "I want an explanation",
  other: "Something else",
};

/** The cap the API enforces on a complaint's description. */
export const COMPLAINT_MAX_WORDS = 500;

export interface Rating {
  id: string;
  requestId: string;
  panelBeaterId: string;
  score: number;
  comment?: string;
  hidden: boolean;
  hiddenByName?: string;
  createdAt: string;
}

/** What a workshop's public score looks like. */
export interface RatingSummary {
  average: number;
  count: number;
}

export interface ComplaintMedia {
  id: string;
  url: string;
  pathname: string;
  contentType?: string;
  isVideo: boolean;
}

export interface ComplaintNote {
  id: string;
  body: string;
  authorName: string;
  /** True = Price my Prang only; the repairer never sees it. */
  internal: boolean;
  createdAt: string;
}

export interface Complaint {
  id: string;
  requestId: string;
  reference?: string;
  panelBeaterId: string;
  panelBeaterName?: string;
  category: ComplaintCategory;
  description: string;
  vehicleSafety?: VehicleSafety;
  collectedOn?: string;
  problemNoticedOn?: string;
  stillWithRepairer?: boolean;
  desiredOutcome?: ComplaintOutcome;
  raisedWithRepairer?: boolean;
  status: ComplaintStatus;
  resolvedAt?: string;
  createdAt: string;
  media: ComplaintMedia[];
  notes: ComplaintNote[];
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
  /** What the part cost the workshop, before mark-up. Optional. */
  partsCost?: number;
  /** What the part is CHARGED at — cost plus the rate card's mark-up. */
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

  /** The resolved rand amount, however it was entered. */
  sundries: number;
  /** Set only when sundries were entered as a percentage of parts. */
  sundriesPercent?: number;
  consumables: number;

  partsTotal: number;
  /** Third-party work, totalled apart from parts. */
  outWorkTotal: number;
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

// ---------------------------------------------------------------------------
// Dev planner — Super Admin's own pipeline of development work. Nothing here is
// visible to panel beaters or consumers.
// ---------------------------------------------------------------------------

/** Three levels, deliberately: drop-everything / committed / only-if-there's-time. */
export type DevPriority = "urgent" | "must_do" | "nice_to_have";

export type DevTicketStatus = "backlog" | "in_progress" | "done";

export const DEV_PRIORITIES: DevPriority[] = ["urgent", "must_do", "nice_to_have"];
export const DEV_TICKET_STATUSES: DevTicketStatus[] = ["backlog", "in_progress", "done"];

export const DEV_PRIORITY_LABEL: Record<DevPriority, string> = {
  urgent: "Urgent",
  must_do: "Not urgent but must be done",
  nice_to_have: "Nice to have",
};

/** The same three, shortened for table cells and the stat cards. */
export const DEV_PRIORITY_SHORT: Record<DevPriority, string> = {
  urgent: "Urgent",
  must_do: "Must be done",
  nice_to_have: "Nice to have",
};

export const DEV_STATUS_LABEL: Record<DevTicketStatus, string> = {
  backlog: "Backlog",
  in_progress: "In progress",
  done: "Done",
};

export interface DevTicketAttachment extends MediaRef {
  id: string;
  /** The name the file had on the uploader's machine. */
  fileName: string;
  size?: number;
  createdAt: string;
}

/**
 * A comment on a ticket. Deliberately separate from `DevTicket.detail`: the
 * detail is the original ask and must survive, notes are the conversation that
 * follows. Author is stamped from the session, never the request body.
 */
export interface DevTicketNote {
  id: string;
  body: string;
  createdById?: string;
  createdByName: string;
  createdByEmail?: string;
  createdAt: string;
}

export interface DevTicket {
  id: string;
  title: string;
  detail?: string;
  priority: DevPriority;
  status: DevTicketStatus;

  /** "yyyy-mm-dd". The daily cron emails the author on this date. */
  remindOn?: string;
  reminderSentAt?: string;

  createdById?: string;
  createdByName: string;
  createdByEmail?: string;

  createdAt: string;
  updatedAt: string;
  completedAt?: string;

  attachments: DevTicketAttachment[];
  notes: DevTicketNote[];
}

/**
 * The four cards. Counts are of OPEN tickets only (backlog + in progress) —
 * a pipeline that includes finished work only ever grows, which tells you
 * nothing about what's left to do.
 */
export interface DevTicketStats {
  open: number;
  urgent: number;
  mustDo: number;
  niceToHave: number;
  done: number;
  overdue: number;
}
