import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LEGAL, LEGAL_LINKS } from "@/lib/legal";

/** Shared frame for /terms, /privacy and /refunds. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-offwhite">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
        <Link href="/" aria-label="Price my Prang home">
          <Logo variant="horizontal-light" className="h-16 w-auto" priority />
        </Link>
        <Link href="/" className="text-sm font-semibold text-teal hover:text-ink">
          Back to home
        </Link>
      </header>

      <article className="mx-auto max-w-3xl px-5 pb-16">
        <div className="rounded-2xl border border-teal/15 bg-white p-6 sm:p-10">
          <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-ink/60">Last updated {LEGAL.lastUpdated}</p>
          <div className="mt-8 space-y-4 text-ink/80 [&_a]:font-semibold [&_a]:text-teal [&_a]:underline [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-2">
            {children}
          </div>
        </div>
      </article>

      <LegalFooter />
    </main>
  );
}

/** The links every public page footer carries. */
export function LegalFooterLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={className}>
      <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2">
        {LEGAL_LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-white underline hover:text-white/80">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function LegalFooter() {
  return (
    <footer className="border-t border-teal/10 bg-ink py-8 text-center text-sm text-white/70">
      <LegalFooterLinks className="mb-4" />
      <p>
        © {new Date().getFullYear()} {LEGAL.legalName}
      </p>
    </footer>
  );
}

/**
 * Who we are and how to reach us, printed on each legal page. Lines with no
 * value in lib/legal.ts are left out.
 */
export function ContactBlock() {
  const rows: [string, string][] = [
    ["Company", LEGAL.legalName],
    ["Registration number", LEGAL.registrationNumber],
    ["Physical address", LEGAL.physicalAddress],
    ["Email", LEGAL.contactEmail],
    ["Phone", LEGAL.contactPhone],
    ["Website", LEGAL.website],
  ];
  return (
    <dl className="grid gap-x-6 gap-y-1 rounded-xl bg-offwhite p-5 text-sm sm:grid-cols-[auto_1fr]">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-semibold text-ink">{k}</dt>
            <dd>
              {k === "Email" ? <a href={`mailto:${v}`}>{v}</a> : v}
            </dd>
          </div>
        ))}
    </dl>
  );
}

/** "email us at x" when we have an address, a softer line when we don't. */
export function ContactUs() {
  return LEGAL.contactEmail ? (
    <>
      email us at <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
    </>
  ) : (
    <>contact us using the details at the end of this page</>
  );
}
