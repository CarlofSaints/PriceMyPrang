# Price my Prang

> Crash · Quote · Claim — the fastest way to price a prang.

An online tool where consumers request repair quotes from nearby panel beaters,
plus an authenticated back-office portal where assessors build and issue the
quotes. Built with **Next.js 16 (App Router)**, **Vercel Blob**, **Resend**,
**Google Maps** and **Claude** (licence-disc reading).

---

## Stack

| Concern        | Choice |
|----------------|--------|
| Framework      | Next.js 16 (App Router, Turbopack, React 19) |
| Styling        | Tailwind CSS v4 + brand tokens (Space Grotesk / Archivo) |
| Data store     | Vercel Blob (JSON documents) |
| Media          | Vercel Blob (client uploads — bypasses the 4.5MB API limit) |
| Auth           | Cookie session (JWT via `jose`) + bcrypt, role/permission model |
| Email          | Resend (branded HTML) |
| Maps           | Google Maps (`@vis.gl/react-google-maps`) + Geocoding API |
| Vehicle ID     | Claude vision reads the SA licence disc *(VIN API upgrade planned)* |
| PDF quotes     | `@react-pdf/renderer` |

## Consumer flow (mobile-first)

`/` → **Price my Prang** button → multi-step form:
name, email, insurance/warranty/claim questions, **licence-disc photo** (read by
Claude), optional **20-second in-browser video** (auto-stops at 20s), engine-damage
question, **repeatable damage photos (max 15)**, quotes wanted (1–4) → **map** of
nearby panel beaters → select → **submit**. A reference `PMP-YYYYMMDD-SURNAME-NN`
is generated and confirmation emails go to the consumer *and* the assessors.

## Portal (`/portal`, auth required)

- **Dashboard** — Total Requests / In Progress / Completed / Total Executed cards + requests grid (permission: `view_dashboard`).
- **Request detail** — full submission, photos, video, disc, status control.
- **Quote builder** — pull a request by reference, select workshop, add parts (from the parts catalogue or manually), enter senior/junior labour hours → generates a branded PDF (permission: `build_quotes`).
- **Panel beaters** — onboarding form; panel beaters can self-onboard (`manage_panel_beaters` / `onboard_self`).
- **Parts** — parts-per-supplier catalogue (`manage_parts`).
- **Users** — roles & permissions (`manage_users`).

### Roles

`admin` · `assessor` · `panel_beater`. Defaults live in `lib/permissions.ts`;
per-user extra permissions can be granted on top.

---

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values (see below)
npm run dev
```

### Environment variables

See `.env.example`. Minimum to run locally: `SESSION_SECRET`, `SEED_SECRET`,
`BLOB_READ_WRITE_TOKEN` (link a Vercel Blob store). Maps, Claude and Resend are
optional — the app degrades gracefully without them (map falls back to a list,
disc reading is skipped, emails are not sent).

### Seed the first admin

With `SEED_SECRET` set, create the first admin (once):

```
POST /api/seed
{ "secret": "YOUR_SEED_SECRET", "name": "Carl", "email": "you@example.com", "password": "changeme" }
```

> On Windows run this from **cmd.exe** (PowerShell aliases `curl` to
> `Invoke-WebRequest`), or use `Invoke-RestMethod`.

Then sign in at `/login`.

## Deploy (Vercel)

Push to GitHub and import into Vercel. Add a **Blob** store and set the env vars.
Production emails should send from `prang@pricemyprang.co.za` (verify the domain
in Resend) via `EMAIL_FROM`. Point `www.pricemyprang.com` / `.co.za` at the
Vercel project when ready.

## Known follow-ups

- **VIN lookup upgrade** — currently Claude reads the disc; integrate a proper
  VIN → vehicle-details API (e.g. firstcheck.co.za / vindocs.com/za) later.
- Google **Map ID** for Advanced Markers (currently uses classic markers).
