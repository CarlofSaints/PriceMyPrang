import Link from "next/link";
import { Logo } from "@/components/Logo";
import QuoteLauncher from "@/components/QuoteLauncher";
import RegisterLauncher from "@/components/RegisterLauncher";

const APPROVALS = [
  { src: "/approvals/miwa.png", alt: "MIWA" },
  { src: "/approvals/mibco.jpg", alt: "MIBCO" },
  { src: "/approvals/rmi.png", alt: "RMI" },
];

const STEPS = [
  { n: "1", t: "Snap the damage", d: "Answer a few quick questions and upload photos of the prang." },
  { n: "2", t: "Pick your workshop", d: "Choose nearby panel beaters from the map — as many quotes as you like." },
  { n: "3", t: "Pay & confirm", d: "A flat R350 per quote — quick, secure checkout to lock in your request." },
  { n: "4", t: "Get your quote", d: "Our assessors do the legwork and come back to you within 24 hours." },
];

export default function Home() {
  return (
    <main className="min-h-dvh bg-offwhite">
      {/* Top bar */}
      <header className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-5 py-4 sm:flex-row sm:justify-between">
        <Logo variant="horizontal-light" className="h-20 w-auto sm:h-40" priority />
        <div className="flex items-center gap-3">
          <RegisterLauncher />
          <Link href="/login" className="text-sm font-semibold text-teal hover:text-ink">
            Portal login
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-5 pt-8 pb-16 text-center sm:pt-14">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-teal">
          Crash · Quote · Claim
        </p>
        <h1 className="mx-auto max-w-2xl font-display text-4xl font-bold leading-tight text-ink sm:text-6xl">
          The fastest way to <span className="text-coral">price a prang</span>.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-ink/70">
          Had a bump? Request repair quotes from trusted panel beaters near you — no phone calls,
          no runaround. Just snap, pick and go.
        </p>

        <div className="mt-9 flex justify-center">
          <QuoteLauncher size="lg" />
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-5 pb-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="pmp-card p-6">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-teal font-display text-lg font-bold text-white">
                {s.n}
              </div>
              <h3 className="font-display text-lg font-semibold text-ink">{s.t}</h3>
              <p className="mt-1 text-sm text-ink/70">{s.d}</p>
            </div>
          ))}
        </div>

        {/* About us */}
        <div className="mt-8 rounded-2xl border border-teal/15 bg-white p-6 sm:p-8">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-teal">
            About us
          </p>
          <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">
            Quotes you can trust, from people who know the trade.
          </h2>
          <p className="mt-3 max-w-2xl text-ink/70">
            Price my Prang takes the phone calls and guesswork out of getting your car repaired.
            We connect you with trusted panel beaters near you and handle the legwork, so you can
            compare quotes and get back on the road faster.
          </p>
          <p className="mt-3 max-w-2xl text-ink/70">
            Every estimate is backed by our own team of{" "}
            <span className="font-semibold text-ink">VDQ-approved vehicle damage estimators</span>,
            so the numbers you receive are accurate, fair and independently assessed.
          </p>
        </div>

        {/* Accreditation */}
        <div className="mt-8 rounded-2xl border border-teal/15 bg-white p-6 text-center">
          <p className="mx-auto max-w-2xl font-display text-lg font-semibold text-ink">
            Only MIWA, MIBCO and RMI approved panel beaters are available on the Price my Prang
            platform.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-6">
            {APPROVALS.map((a) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={a.alt}
                src={a.src}
                alt={`${a.alt} approved`}
                className="h-14 w-auto object-contain sm:h-16"
              />
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-teal/10 bg-ink py-8 text-center text-sm text-white/70">
        <Logo variant="horizontal-dark" className="mx-auto mb-4 h-10 w-auto" />
        <div className="mb-4 flex justify-center">
          <RegisterLauncher className="rounded-full bg-coral px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#d94a33]" />
        </div>
        <p>© {new Date().getFullYear()} Price my Prang · Crash · Quote · Claim</p>
      </footer>
    </main>
  );
}
