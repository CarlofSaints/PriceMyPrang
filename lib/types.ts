// ---------------------------------------------------------------------------
// Price my Prang — shared data types (stored as JSON in Vercel Blob)
// ---------------------------------------------------------------------------

export type Permission =
  | "manage_users"
  | "manage_panel_beaters"
  | "onboard_self" // a panel beater editing their own listing
  | "view_dashboard"
  | "build_quotes"
  | "manage_parts";

export type RoleName = "admin" | "assessor" | "panel_beater";

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: RoleName;
  /** Extra permissions granted on top of the role defaults. */
  extraPermissions?: Permission[];
  /** If this user is a panel beater login, the panel beater they own. */
  panelBeaterId?: string;
  active: boolean;
  createdAt: string;
}

export interface PanelBeater {
  id: string;
  companyName: string; // mandatory
  tradingAs?: string;
  companyRegNumber: string; // mandatory
  vatNumber?: string;
  physicalAddress: string; // mandatory — geocoded for the map
  lat?: number;
  lng?: number;
  mibcoNumber: string; // mandatory
  rmiNumber: string; // mandatory
  sambraNumber: string; // mandatory
  miwaNumber?: string;
  labourRateSenior?: number;
  labourRateJunior?: number;
  logoUrl?: string;
  email?: string;
  phone?: string;
  active: boolean;
  /** Approval workflow. Public self-registrations start as "pending". */
  status?: "pending" | "approved" | "declined";
  /** True when submitted via the public "Become a registered panel beater" form. */
  submittedByPublic?: boolean;
  createdAt: string;
}

export interface Part {
  id: string;
  supplier: string;
  name: string;
  partNumber?: string;
  price: number;
  createdAt: string;
}

export type YesNo = "yes" | "no";
export type YesNoUnsure = "yes" | "no" | "unsure";

export interface MediaRef {
  url: string;
  pathname: string;
  contentType?: string;
}

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
  createdAt: string;
  status: RequestStatus;

  // Consumer answers
  firstName: string;
  lastName: string;
  email: string;
  hasInsurance: YesNo;
  underWarranty: YesNoUnsure;
  isInsuranceClaim: YesNo;
  isThirdPartyClaim: YesNo;
  suspectedEngineDamage: YesNo;
  quotesRequested: number; // 1-4

  vehicle: VehicleDetails;

  discImage?: MediaRef;
  video?: MediaRef;
  damagePhotos: MediaRef[];

  // Location + chosen panel beaters
  location?: { lat: number; lng: number };
  selectedPanelBeaterIds: string[];

  // Quotes built by assessors (one per selected panel beater)
  quotes: BuiltQuote[];
}

export interface QuoteLineItem {
  partId?: string;
  supplier?: string;
  name: string;
  partNumber?: string;
  quantity: number;
  unitPrice: number;
}

export interface BuiltQuote {
  id: string;
  reference: string;
  panelBeaterId: string;
  parts: QuoteLineItem[];
  seniorHours: number;
  juniorHours: number;
  labourRateSenior: number;
  labourRateJunior: number;
  partsTotal: number;
  labourTotal: number;
  subtotal: number;
  vat: number;
  total: number;
  pdfUrl?: string;
  createdAt: string;
  createdByName?: string;
}
