"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui";
import QuoteFlow from "./QuoteFlow";

export default function QuoteLauncher({ size = "lg" }: { size?: "md" | "lg" }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <div className="flex flex-col items-center gap-2">
        <Button variant="coral" size={size} onClick={() => setOpen(true)} className="shadow-lg">
          Price my Prang
        </Button>
        <span className="text-sm font-medium text-ink/60">request a quote</span>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/40 backdrop-blur-sm">
          <div className="flex min-h-full items-start justify-center p-3 sm:p-6">
            <div className="my-4 w-full max-w-xl rounded-2xl bg-offwhite p-5 shadow-2xl sm:p-7">
              <QuoteFlow onClose={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
