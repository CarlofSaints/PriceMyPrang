"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zar, shortDate } from "@/lib/format";
import { Button } from "./ui";

export interface ConsumerQuote {
  id: string;
  workshopName: string;
  total: number;
  createdAt: string;
  pdfUrl?: string;
  status: "awaiting_approval" | "accepted" | "declined";
}

export default function ConsumerQuoteList({
  token,
  quotes,
}: {
  token: string;
  quotes: ConsumerQuote[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accepted = quotes.find((q) => q.status === "accepted");

  async function accept(quoteId: string) {
    setBusyId(quoteId);
    setError(null);
    try {
      const res = await fetch("/api/public/quotes/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, quoteId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't accept that quote. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't reach us just then. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (quotes.length === 0) {
    return (
      <div className="pmp-card text-center text-ink/60">
        <p className="font-semibold text-ink">No quotes yet</p>
        <p className="mt-1 text-sm">
          The workshops are still pricing your repair. We&apos;ll email you as soon as the first
          quote lands.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-ink">
          {error}
        </p>
      )}

      {accepted && (
        <p className="rounded-xl border border-teal/30 bg-teal/10 px-4 py-3 text-sm text-ink">
          You accepted <strong>{accepted.workshopName}</strong>. They&apos;ll be in touch to
          arrange your repair. You can still change your mind below until work starts.
        </p>
      )}

      {quotes.map((q) => (
        <div
          key={q.id}
          className={`pmp-card space-y-3 ${q.status === "accepted" ? "border-teal/50" : ""}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-semibold text-ink">{q.workshopName}</h3>
              <p className="text-xs text-ink/50">Quoted {shortDate(q.createdAt)}</p>
            </div>
            <div className="text-right">
              <p className="font-display text-xl font-bold text-ink">{zar(q.total)}</p>
              <p className="text-xs text-ink/50">incl VAT</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {q.pdfUrl ? (
              <a
                href={q.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-teal hover:underline"
              >
                View the full quote (PDF)
              </a>
            ) : (
              <span className="text-sm text-ink/40">PDF not available</span>
            )}

            {q.status === "accepted" ? (
              <span className="rounded-full bg-teal/15 px-3 py-1 text-xs font-semibold text-teal">
                Accepted
              </span>
            ) : (
              <Button
                onClick={() => accept(q.id)}
                disabled={busyId !== null}
                variant={accepted ? "outline" : "primary"}
              >
                {busyId === q.id ? "Accepting…" : accepted ? "Choose this one instead" : "Accept this quote"}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
