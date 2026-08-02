import type { RatingSummary } from "@/lib/types";

/** Five stars, filled to the average. Half marks round to the nearer star. */
export function RatingStars({
  summary,
  size = "md",
}: {
  summary: RatingSummary;
  size?: "sm" | "md" | "lg";
}) {
  const px = size === "lg" ? "text-3xl" : size === "sm" ? "text-sm" : "text-xl";
  const filled = Math.round(summary.average);

  return (
    <span className="inline-flex items-center gap-1" aria-label={`${summary.average} out of 5`}>
      <span className={`${px} leading-none tracking-tight`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={n <= filled ? "text-amber" : "text-ink/15"}>
            ★
          </span>
        ))}
      </span>
    </span>
  );
}

/** The headline block: score, stars, and how many people it's based on. */
export function RatingHeadline({ summary }: { summary: RatingSummary }) {
  if (summary.count === 0) {
    return (
      <div className="pmp-card p-6">
        <p className="text-sm text-ink/60">
          No ratings yet. Customers can rate a repair once they&apos;ve accepted a quote and the
          work is done.
        </p>
      </div>
    );
  }

  return (
    <div className="pmp-card flex flex-wrap items-center gap-x-6 gap-y-2 p-6">
      <div>
        <p className="font-display text-4xl font-bold text-ink">
          {summary.average.toFixed(1)}
          <span className="text-xl font-normal text-ink/40"> / 5</span>
        </p>
      </div>
      <div>
        <RatingStars summary={summary} size="lg" />
        <p className="mt-1 text-sm text-ink/60">
          from {summary.count} {summary.count === 1 ? "customer" : "customers"}
        </p>
      </div>
    </div>
  );
}
