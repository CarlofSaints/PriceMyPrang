"use client";

import { useEffect, useState } from "react";
import PanelBeaterForm from "./PanelBeaterForm";

export default function RegisterLauncher({
  className = "",
  label = "Become a registered panel beater",
}: {
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function close() {
    setOpen(false);
    setDone(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          className ||
          "rounded-full bg-teal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#026e76]"
        }
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/40 backdrop-blur-sm">
          <div className="flex min-h-full items-start justify-center p-3 sm:p-6">
            <div className="my-4 w-full max-w-2xl rounded-2xl bg-offwhite p-5 shadow-2xl sm:p-7">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl font-bold text-ink">
                    {done ? "Application received" : "Become a registered panel beater"}
                  </h2>
                  <p className="text-sm text-ink/60">
                    {done
                      ? "Thanks — our team will review your details."
                      : "Join the Price my Prang network. We only list MIWA, MIBCO & RMI approved workshops."}
                  </p>
                </div>
                <button onClick={close} className="text-ink/40 hover:text-ink" aria-label="Close">
                  ✕
                </button>
              </div>

              {done ? (
                <div className="space-y-4 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal/10 text-3xl">
                    ✅
                  </div>
                  <p className="text-ink/70">
                    Your application has been submitted and is pending approval. We&apos;ll be in
                    touch once your MIWA / MIBCO / RMI credentials are verified.
                  </p>
                  <button
                    onClick={close}
                    className="rounded-full bg-teal px-6 py-3 font-semibold text-white hover:bg-[#026e76]"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <PanelBeaterForm
                  mode="public"
                  submitUrl="/api/panel-beaters/register"
                  onSuccess={() => setDone(true)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
