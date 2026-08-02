import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listComplaints, ratingSummaryFor } from "@/lib/store";
import ComplaintsGrid from "@/components/ComplaintsGrid";
import { RatingHeadline } from "@/components/RatingStars";

// A workshop's own complaints. Never another's — the query is scoped by the
// panelBeaterId on the session, not by anything in the URL.
export default async function MyComplaintsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user, "manage_own_complaints")) redirect("/portal");

  if (!user.panelBeaterId) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-bold text-ink">Complaints</h1>
        <p className="text-ink/60">This login isn&apos;t linked to a workshop.</p>
      </div>
    );
  }

  const [complaints, summary] = await Promise.all([
    listComplaints({ panelBeaterId: user.panelBeaterId }),
    ratingSummaryFor(user.panelBeaterId),
  ]);

  // Internal notes are Price my Prang's own view of a dispute and are stripped
  // for the party being complained about.
  const visible = complaints.map((c) => ({ ...c, notes: c.notes.filter((n) => !n.internal) }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Your rating &amp; complaints</h1>
        <p className="text-ink/60">
          How your customers rate you, and anything they&apos;ve raised. Complaints are private
          between you and Price my Prang — they are never shown publicly.
        </p>
      </div>

      <RatingHeadline summary={summary} />

      <ComplaintsGrid initial={visible} canManageAll={false} />
    </div>
  );
}
