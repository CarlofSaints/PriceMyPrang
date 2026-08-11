// Display names for the areas an activity action can belong to.
//
// DELIBERATELY IN ITS OWN FILE, with no imports. lib/activityLog.ts pulls in
// getDb() and therefore Prisma, which cannot be bundled into a client
// component — importing these labels from there broke the build with
// "the chunking context does not support external modules (request:
// node:module)". Keep this file free of anything server-side.

export const ACTIVITY_AREAS: Record<string, string> = {
  auth: "Sign in & passwords",
  user: "Users",
  role: "Roles",
  panel_beater: "Panel beaters",
  warranty: "Warranties",
  request: "Quote requests",
  quote: "Quotes",
  additional: "Additionals",
  insurer: "Insurers",
  insurer_contact: "Insurer contacts",
  rate: "Rate cards",
  supplier: "Suppliers",
  complaint: "Complaints",
  rating: "Ratings",
  feedback: "Consumer feedback",
  agreement: "Repairer agreement",
  dev_ticket: "Dev planner",
  integration: "Integrations",
  media: "Files",
  ocr: "Document reading",
  cron: "Scheduled jobs",
  admin: "Admin",
};

/** The bit before the first dot — "quote.build" is in the "quote" area. */
export function areaOf(action: string): string {
  return action.split(".")[0] ?? "other";
}

export function areaLabel(action: string): string {
  const area = areaOf(action);
  return ACTIVITY_AREAS[area] ?? area;
}
