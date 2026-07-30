// ---------------------------------------------------------------------------
// The South African motor insurance market, as a consumer would name it.
//
// These are BRANDS, not licensed entities, and that is deliberate: someone
// filling in the quote form knows they are "with MiWay", not that MiWay is
// underwritten by Santam. Several names below share an underwriter (the
// Telesure stable — Auto & General, Budget, Dial Direct, First for Women,
// Virseker — is one company wearing five badges), but a consumer who cannot
// find their own badge picks "Other", and we have learnt nothing.
//
// Seeded, then owned by admins: once these rows exist they are ordinary data
// and can be renamed or deactivated on /portal/admin/insurers. Re-running the
// seed only ever ADDS what is missing — it never revives something an admin
// deactivated, and never renames what they have edited.
// ---------------------------------------------------------------------------

export const SA_INSURERS: string[] = [
  // Direct insurers — the names most people will look for first.
  "Santam",
  "OUTsurance",
  "Discovery Insure",
  "MiWay",
  "King Price",
  "Old Mutual Insure",
  "iWYZE",
  "Hollard",
  "Momentum Insure",
  "Bryte Insurance",
  "Auto & General",
  "Budget Insurance",
  "Dial Direct",
  "First for Women",
  "Virseker",
  "Naked Insurance",
  "Pineapple Insurance",
  "Prime Meridian Direct",
  "Sanlam",
  "Clientèle",
  "Bidvest Insurance",
  "Renasa",
  "Western National Insurance",
  "Constantia Insurance",
  "Infiniti Insurance",
  "New National Assurance",
  "Guardrisk",
  "Genric Insurance",
  "MUA Insurance Acceptances",
  "Compass Insure",
  "AIG South Africa",
  "Chubb Insurance South Africa",

  // Bank-badged policies. People say "my car insurance is through FNB", so
  // these have to be findable even though the underwriter differs.
  "Absa Insurance",
  "FNB Insurance",
  "Nedbank Insurance",
  "Standard Bank Insurance",
  "Capitec Insurance",
  "African Bank Insurance",

  // Vehicle-manufacturer branded cover, sold at the dealership.
  "BMW Insurance",
  "Mercedes-Benz Insurance",
  "Toyota Insurance",
  "Volkswagen Insurance",
  "Ford Insurance",
  "Hyundai Insurance",
  "Kia Insurance",
  "Nissan Insurance",
];
