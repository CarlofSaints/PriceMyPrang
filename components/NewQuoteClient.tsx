"use client";

import { useRouter } from "next/navigation";
import QuoteFlow from "./QuoteFlow";

// "New quote" — reuses the intake form in repairer mode (no consumer request),
// then hands off to the quote builder pre-loaded with the new request.
export default function NewQuoteClient({
  panelBeaters,
  lockedPbId,
}: {
  panelBeaters: { id: string; name: string }[];
  lockedPbId?: string;
}) {
  const router = useRouter();
  return (
    <QuoteFlow
      mode="repairer"
      repairerPanelBeaters={panelBeaters}
      repairerLockedPbId={lockedPbId}
      onClose={() => router.push("/portal")}
      onCreated={(ref) =>
        router.push(`/portal/quote-builder?ref=${encodeURIComponent(ref)}`)
      }
    />
  );
}
