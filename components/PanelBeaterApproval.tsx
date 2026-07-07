"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PanelBeaterApproval({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function set(status: "approved" | "declined") {
    setBusy(true);
    await fetch("/api/panel-beaters", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => set("approved")}
        disabled={busy}
        className="rounded-full bg-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#026e76] disabled:opacity-50"
      >
        Approve
      </button>
      <button
        onClick={() => set("declined")}
        disabled={busy}
        className="rounded-full border border-coral/40 px-3 py-1.5 text-xs font-semibold text-coral hover:bg-coral/5 disabled:opacity-50"
      >
        Decline
      </button>
    </div>
  );
}
