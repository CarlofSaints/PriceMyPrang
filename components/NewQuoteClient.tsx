"use client";

import { useRouter } from "next/navigation";
import QuoteFlow from "./QuoteFlow";

// Panel-beater "New quote" — reuses the intake form in repairer mode, then
// hands off to the quote builder pre-loaded with the new request.
export default function NewQuoteClient() {
  const router = useRouter();
  return (
    <QuoteFlow
      mode="repairer"
      onClose={() => router.push("/portal")}
      onCreated={(ref) =>
        router.push(`/portal/quote-builder?ref=${encodeURIComponent(ref)}`)
      }
    />
  );
}
