import Link from "next/link";
import { Logo } from "@/components/Logo";
import QuoteLauncher from "@/components/QuoteLauncher";

const STEPS = [
  { n: "1", t: "Snap the damage", d: "Answer a few quick questions and upload photos of the prang." },
  { n: "2", t: "Pick your workshop", d: "Choose nearby panel beaters from the map — as many quotes as you like." },
  { n: "3", t: "Get your quote", d: "Our assessors do the legwork and come back to you within 24 hours." },
];

export default function Home() {
  return (
    <main className="min-h-dvh bg-offwhite">
      {/* Top bar */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <Logo variant="horizontal-light" className="h-9 w-auto" priority />
        <Link href="/login" className="text-sm font-semibold text-teal hover:text-ink">
          Portal login
        </Link>
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
        <div className="grid gap-4 sm:grid-cols-3">
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
      </section>

      {/* Footer */}
      <footer className="border-t border-teal/10 bg-ink py-8 text-center text-sm text-white/70">
        <Logo variant="horizontal-dark" className="mx-auto mb-3 h-8 w-auto" />
        <p>© {new Date().getFullYear()} Price my Prang · Crash · Quote · Claim</p>
      </footer>
    </main>
  );
}
