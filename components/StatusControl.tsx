"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RequestStatus } from "@/lib/types";

const OPTIONS: { value: RequestStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

export default function StatusControl({
  reference,
  current,
}: {
  reference: string;
  current: RequestStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<RequestStatus>(current);
  const [busy, setBusy] = useState(false);

  async function change(next: RequestStatus) {
    setBusy(true);
    setStatus(next);
    await fetch(`/api/requests/${reference}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <select
      value={status}
      disabled={busy}
      onChange={(e) => change(e.target.value as RequestStatus)}
      className="rounded-full border border-teal/30 bg-white px-3 py-1.5 text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-teal/30"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
