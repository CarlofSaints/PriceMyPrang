"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Additional,
  AdditionalStatus,
  InsuranceCompany,
  QuoteLineItem,
} from "@/lib/types";
import { QUOTE_LINE_CODES } from "@/lib/types";
import { computeQuoteTotals } from "@/lib/quoteTotals";
import { zar, shortDate } from "@/lib/format";
import { Button, Field, inputClass } from "./ui";

export interface JobOption {
  reference: string;
  clientName: string;
  vehicle: string;
  registration?: string;
  isInsuranceClaim: boolean;
  claimNumber?: string;
  insurerName?: string;
  insurerId?: string;
}

const emptyLine: QuoteLineItem = {
  code: "",
  description: "",
  quantity: 1,
  partsAmount: 0,
  panelAmount: 0,
  panelHours: 0,
  paintAmount: 0,
  paintHours: 0,
  stripAmount: 0,
  stripHours: 0,
};

const STATUS_LABEL: Record<AdditionalStatus, string> = {
  pending: "Awaiting insurer",
  approved: "Approved",
  declined: "Declined",
};

const STATUS_STYLE: Record<AdditionalStatus, string> = {
  pending: "bg-amber/25 text-ink",
  approved: "bg-teal/15 text-teal",
  declined: "bg-coral/15 text-coral",
};

/** Blank instead of a sticky "0" in a number box. */
const numVal = (n?: number) => (n ? String(n) : "");

export default function AdditionalsManager({
  jobs,
  insurers,
  panelBeaterId,
}: {
  jobs: JobOption[];
  /** Active insurers with the contacts THIS workshop may see. */
  insurers: InsuranceCompany[];
  panelBeaterId: string;
}) {
  const [reference, setReference] = useState(jobs[0]?.reference ?? "");
  const [list, setList] = useState<Additional[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // The draft being written. Null when nothing is being raised.
  const [lines, setLines] = useState<QuoteLineItem[] | null>(null);
  const [reason, setReason] = useState("");
  const [claimNumber, setClaimNumber] = useState("");
  const [draftId, setDraftId] = useState<string | undefined>();

  const job = jobs.find((j) => j.reference === reference);

  const load = useCallback(async (ref: string) => {
    if (!ref) return setList([]);
    setLoading(true);
    try {
      const res = await fetch(`/api/additionals?reference=${encodeURIComponent(ref)}`);
      setList(res.ok ? await res.json() : []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(reference);
  }, [reference, load]);

  // The claim number starts from the job and stays editable — an insurer can't
  // process additionals without one, and it is routinely still outstanding when
  // the original quote is built.
  useEffect(() => {
    setClaimNumber(job?.claimNumber ?? "");
  }, [job?.reference, job?.claimNumber]);

  const totals = useMemo(
    () =>
      computeQuoteTotals({
        lines: lines ?? [],
        sundriesValue: 0,
        sundriesMode: "rand",
        consumables: 0,
      }),
    [lines]
  );

  function startNew() {
    setDraftId(undefined);
    setReason("");
    setLines([{ ...emptyLine }]);
    setError(null);
    setNotice(null);
  }

  function editDraft(a: Additional) {
    setDraftId(a.id);
    setReason(a.reason ?? "");
    setClaimNumber(a.claimNumber ?? job?.claimNumber ?? "");
    setLines(a.lines.length ? a.lines.map((l) => ({ ...l })) : [{ ...emptyLine }]);
    setError(null);
  }

  function setLine(i: number, patch: Partial<QuoteLineItem>) {
    setLines((ls) => (ls ? ls.map((l, x) => (x === i ? { ...l, ...patch } : l)) : ls));
  }

  async function save(): Promise<Additional | null> {
    if (!lines) return null;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/additionals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draftId,
          reference,
          panelBeaterId,
          reason,
          claimNumber,
          lines: lines.filter((l) => l.description.trim()),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't save that.");
        return null;
      }
      setDraftId(data.id);
      await load(reference);
      return data as Additional;
    } catch {
      setError("Couldn't save that. Please try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    const saved = await save();
    if (saved) setNotice({ ok: true, text: `Saved as a draft — not sent yet.` });
  }

  async function updateStatus(a: Additional, status: AdditionalStatus) {
    const note =
      status === "pending"
        ? undefined
        : prompt(
            status === "approved"
              ? "Anything to record about the approval? (optional)"
              : "Why was it declined? (optional)"
          ) ?? undefined;

    const res = await fetch("/api/additionals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: a.id, panelBeaterId, status, responseNote: note }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setNotice({ ok: false, text: d.error || "Couldn't update that." });
      return;
    }
    await load(reference);
  }

  async function removeDraft(a: Additional) {
    if (!confirm(`Delete this draft (Additionals #${a.seq})? It hasn't been sent.`)) return;
    const res = await fetch(
      `/api/additionals?id=${encodeURIComponent(a.id)}&panelBeaterId=${encodeURIComponent(panelBeaterId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setNotice({ ok: false, text: d.error || "Couldn't delete that." });
      return;
    }
    if (draftId === a.id) setLines(null);
    await load(reference);
  }

  return (
    <div className="space-y-6">
      {notice && (
        <p
          className={`rounded-xl border p-3 text-sm ${
            notice.ok
              ? "border-teal/30 bg-teal/10 text-teal"
              : "border-amber/50 bg-amber/20 text-ink"
          }`}
        >
          {notice.text}
        </p>
      )}

      <div className="pmp-card space-y-4">
        <Field label="Which job?">
          <select
            className={inputClass}
            value={reference}
            onChange={(e) => {
              setReference(e.target.value);
              setLines(null);
              setNotice(null);
            }}
          >
            {jobs.length === 0 && <option value="">No jobs yet</option>}
            {jobs.map((j) => (
              <option key={j.reference} value={j.reference}>
                {j.reference} — {j.clientName} · {j.vehicle}
                {j.registration ? ` (${j.registration})` : ""}
              </option>
            ))}
          </select>
        </Field>

        {job && (
          <div className="grid gap-3 rounded-xl bg-ink/[0.03] p-3 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-ink/50">Client</div>
              <div className="font-semibold text-ink">{job.clientName}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-ink/50">Vehicle</div>
              <div className="font-semibold text-ink">
                {job.vehicle}
                {job.registration ? ` · ${job.registration}` : ""}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-ink/50">Insurer</div>
              <div className="font-semibold text-ink">
                {job.isInsuranceClaim ? job.insurerName || "Not named" : "Cash job"}
              </div>
            </div>
          </div>
        )}

        {!lines && job && (
          <Button type="button" onClick={startNew}>
            Raise additionals
          </Button>
        )}
      </div>

      {lines && job && (
        <DraftEditor
          job={job}
          lines={lines}
          reason={reason}
          claimNumber={claimNumber}
          totals={totals}
          busy={busy}
          error={error}
          insurers={insurers}
          panelBeaterId={panelBeaterId}
          draftId={draftId}
          onReason={setReason}
          onClaimNumber={setClaimNumber}
          onLine={setLine}
          onAddLine={() => setLines((ls) => [...(ls ?? []), { ...emptyLine }])}
          onRemoveLine={(i) =>
            setLines((ls) => (ls && ls.length > 1 ? ls.filter((_, x) => x !== i) : ls))
          }
          onSaveDraft={saveDraft}
          onSave={save}
          onSent={async (msg) => {
            setLines(null);
            setNotice({ ok: true, text: msg });
            await load(reference);
          }}
          onCancel={() => {
            setLines(null);
            setError(null);
          }}
        />
      )}

      <div className="pmp-card p-0 overflow-hidden">
        <div className="border-b border-ink/5 px-4 py-3">
          <h2 className="font-display font-semibold text-ink">
            Additionals on this job
            {loading && <span className="ml-2 text-xs font-normal text-ink/40">loading…</span>}
          </h2>
        </div>
        {list.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink/50">
            Nothing raised on this job yet.
          </p>
        ) : (
          <ul className="divide-y divide-ink/5">
            {list.map((a) => (
              <li key={a.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-ink">Additionals #{a.seq}</span>
                    <span className="ml-2 text-sm text-ink/60">{zar(a.total)} incl VAT</span>
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        a.sentAt ? STATUS_STYLE[a.status] : "bg-ink/10 text-ink/60"
                      }`}
                    >
                      {a.sentAt ? STATUS_LABEL[a.status] : "Draft — not sent"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {!a.sentAt && (
                      <>
                        <button
                          onClick={() => editDraft(a)}
                          className="font-semibold text-teal hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => removeDraft(a)}
                          className="font-semibold text-coral hover:underline"
                        >
                          Delete
                        </button>
                      </>
                    )}
                    {a.sentAt && a.status === "pending" && (
                      <>
                        <button
                          onClick={() => updateStatus(a, "approved")}
                          className="font-semibold text-teal hover:underline"
                        >
                          Mark approved
                        </button>
                        <button
                          onClick={() => updateStatus(a, "declined")}
                          className="font-semibold text-coral hover:underline"
                        >
                          Mark declined
                        </button>
                      </>
                    )}
                    {a.sentAt && a.status !== "pending" && (
                      <button
                        onClick={() => updateStatus(a, "pending")}
                        className="text-ink/50 hover:underline"
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-xs text-ink/50">
                  {a.lines.length} item{a.lines.length === 1 ? "" : "s"}
                  {a.claimNumber ? ` · claim ${a.claimNumber}` : ""}
                  {a.sentAt
                    ? ` · sent ${shortDate(a.sentAt)}${a.sentToEmail ? ` to ${a.sentToEmail}` : ""}`
                    : ` · created ${shortDate(a.createdAt)}`}
                  {a.clientSentAt ? " · client told" : ""}
                </p>
                {a.responseNote && (
                  <p className="mt-1 text-xs italic text-ink/60">“{a.responseNote}”</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** The line editor plus the send controls. Split out to keep the list readable. */
function DraftEditor({
  job,
  lines,
  reason,
  claimNumber,
  totals,
  busy,
  error,
  insurers,
  panelBeaterId,
  draftId,
  onReason,
  onClaimNumber,
  onLine,
  onAddLine,
  onRemoveLine,
  onSaveDraft,
  onSave,
  onSent,
  onCancel,
}: {
  job: JobOption;
  lines: QuoteLineItem[];
  reason: string;
  claimNumber: string;
  totals: ReturnType<typeof computeQuoteTotals>;
  busy: boolean;
  error: string | null;
  insurers: InsuranceCompany[];
  panelBeaterId: string;
  draftId?: string;
  onReason: (v: string) => void;
  onClaimNumber: (v: string) => void;
  onLine: (i: number, patch: Partial<QuoteLineItem>) => void;
  onAddLine: () => void;
  onRemoveLine: (i: number) => void;
  onSaveDraft: () => void;
  onSave: () => Promise<Additional | null>;
  onSent: (msg: string) => void;
  onCancel: () => void;
}) {
  const insurer =
    insurers.find((i) => i.id === job.insurerId) ??
    insurers.find((i) => i.name.toLowerCase() === (job.insurerName ?? "").toLowerCase());
  const contacts = (insurer?.contacts ?? []).filter((c) => c.email);

  const [contactId, setContactId] = useState<string>("");
  const [oneOff, setOneOff] = useState("");
  const [notifyClient, setNotifyClient] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    setContactId(contacts[0]?.id ?? "");
  }, [insurer?.id]);

  const hasItems = lines.some((l) => l.description.trim());

  async function send() {
    setSendError(null);
    if (!claimNumber.trim() && job.isInsuranceClaim) {
      setSendError(
        "Enter the claim number first — an insurer can't match additionals to a claim without it."
      );
      return;
    }
    if (!contactId && !oneOff.trim()) {
      setSendError("Choose a contact at the insurer, or type an address to send to.");
      return;
    }
    if (
      !confirm(
        `Send Additionals to the insurer${
          notifyClient ? ` and tell ${job.clientName}` : ""
        }?\n\nOnce sent it locks — anything further has to be a new request.`
      )
    )
      return;

    setSending(true);
    try {
      // Save first so what goes out is exactly what is stored. The server
      // recomputes the totals either way, but sending an unsaved draft would
      // leave no record of what the insurer was actually shown.
      const saved = await onSave();
      if (!saved) return;

      const res = await fetch("/api/additionals/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: saved.id,
          panelBeaterId,
          contactId: contactId || undefined,
          email: contactId ? undefined : oneOff.trim(),
          notifyClient,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(data.error || "Couldn't send it.");
        return;
      }
      onSent(
        `Sent to ${data.sentTo}.${
          data.clientSent
            ? " The client has been told too."
            : notifyClient
              ? ` The client copy didn't send${data.clientError ? ` (${data.clientError})` : ""} — the insurer has it.`
              : ""
        }`
      );
    } catch {
      setSendError("Couldn't send it. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="pmp-card space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          {draftId ? "Edit additionals" : "New additionals"}
        </h2>
        <p className="text-sm text-ink/60">
          What you found once the car was apart. Priced the same way as a quote.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Claim number"
          hint={
            job.isInsuranceClaim
              ? "Required — the insurer matches additionals to the claim by this."
              : "Not an insurance claim, so this is optional."
          }
        >
          <input
            className={inputClass}
            value={claimNumber}
            onChange={(e) => onClaimNumber(e.target.value)}
            placeholder={job.isInsuranceClaim ? "e.g. CLM-2026-88421" : "—"}
          />
        </Field>
        <Field label="What did you find?" hint="Goes at the top of both emails.">
          <textarea
            className={inputClass}
            rows={2}
            value={reason}
            onChange={(e) => onReason(e.target.value)}
            placeholder="e.g. Inner wing liner torn and headlamp bracket cracked behind the bumper."
          />
        </Field>
      </div>

      <div className="space-y-3">
        {lines.map((l, i) => (
          <div key={i} className="rounded-xl border border-ink/10 p-3">
            <div className="grid gap-2 sm:grid-cols-[7rem_1fr_5rem]">
              <select
                className={inputClass}
                value={l.code ?? ""}
                onChange={(e) => onLine(i, { code: e.target.value })}
              >
                <option value="">Code…</option>
                {QUOTE_LINE_CODES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                className={inputClass}
                placeholder="What is it? e.g. Inner wing liner"
                value={l.description}
                onChange={(e) => onLine(i, { description: e.target.value })}
              />
              <input
                className={inputClass}
                type="number"
                min="0"
                step="0.5"
                placeholder="Qty"
                value={numVal(l.quantity)}
                onChange={(e) => onLine(i, { quantity: Number(e.target.value) })}
              />
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              <NumBox
                label="Parts R"
                value={l.partsAmount}
                onChange={(v) => onLine(i, { partsAmount: v })}
              />
              <NumBox
                label="Panel R"
                value={l.panelAmount}
                hours={l.panelHours}
                onChange={(v) => onLine(i, { panelAmount: v })}
                onHours={(v) => onLine(i, { panelHours: v })}
              />
              <NumBox
                label="Paint R"
                value={l.paintAmount}
                hours={l.paintHours}
                onChange={(v) => onLine(i, { paintAmount: v })}
                onHours={(v) => onLine(i, { paintHours: v })}
              />
              <NumBox
                label="Strip R"
                value={l.stripAmount}
                hours={l.stripHours}
                onChange={(v) => onLine(i, { stripAmount: v })}
                onHours={(v) => onLine(i, { stripHours: v })}
              />
            </div>
            {lines.length > 1 && (
              <button
                type="button"
                onClick={() => onRemoveLine(i)}
                className="mt-2 text-xs font-semibold text-coral hover:underline"
              >
                Remove this item
              </button>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" onClick={onAddLine}>
          + Add another item
        </Button>
      </div>

      <div className="rounded-xl bg-offwhite p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-ink/60">Parts</span>
          <span>{zar(totals.partsTotal)}</span>
        </div>
        {totals.outWorkTotal > 0 && (
          <div className="flex justify-between">
            <span className="text-ink/60">Out work</span>
            <span>{zar(totals.outWorkTotal)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-ink/60">Labour ({totals.totalHours}h)</span>
          <span>{zar(totals.labourTotal)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-ink/10 pt-1">
          <span className="text-ink/60">Subtotal</span>
          <span>{zar(totals.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink/60">VAT</span>
          <span>{zar(totals.vat)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-ink/10 pt-1 font-display text-base font-bold">
          <span>Total incl VAT</span>
          <span>{zar(totals.total)}</span>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-teal/20 p-4">
        <h3 className="font-display font-semibold text-ink">Send to the insurer</h3>
        {!job.isInsuranceClaim && (
          <p className="rounded-lg bg-amber/15 p-2 text-xs text-ink">
            This job isn&apos;t marked as an insurance claim, so there may be nobody to
            approve it. Send it anyway if the client is claiming after all.
          </p>
        )}
        {contacts.length > 0 ? (
          <Field label="Contact">
            <select
              className={inputClass}
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
            >
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.name, c.role].filter(Boolean).join(" · ") || c.email}
                  {c.email ? ` — ${c.email}` : ""}
                  {c.panelBeaterId ? "  (yours)" : ""}
                </option>
              ))}
              <option value="">Someone else…</option>
            </select>
          </Field>
        ) : (
          <p className="text-xs text-ink/60">
            {insurer
              ? `No contacts saved for ${insurer.name} yet. Type an address below — you can save it as your own contact on the Insurers page.`
              : "This job has no insurer on record. Type the address to send to."}
          </p>
        )}
        {(!contactId || contacts.length === 0) && (
          <Field label="Email address">
            <input
              className={inputClass}
              type="email"
              placeholder="claims@insurer.co.za"
              value={oneOff}
              onChange={(e) => setOneOff(e.target.value)}
            />
          </Field>
        )}
        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={notifyClient}
            onChange={(e) => setNotifyClient(e.target.checked)}
          />
          <span>
            Also tell the client
            <span className="block text-xs text-ink/60">
              They get the itemised list and are told the repair waits on approval.
            </span>
          </span>
        </label>
        {sendError && <p className="text-sm text-coral">{sendError}</p>}
      </div>

      {error && <p className="text-sm text-coral">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={send} disabled={sending || busy || !hasItems}>
          {sending ? "Sending…" : "Send for approval"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onSaveDraft}
          disabled={busy || sending || !hasItems}
        >
          {busy ? "Saving…" : "Save as draft"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={sending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** A rand box with an optional hours box beneath it. */
function NumBox({
  label,
  value,
  hours,
  onChange,
  onHours,
}: {
  label: string;
  value?: number;
  hours?: number;
  onChange: (v: number) => void;
  onHours?: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink/60">{label}</span>
      <input
        className={inputClass}
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={numVal(value)}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
      {onHours && (
        <input
          className={`${inputClass} mt-1`}
          type="number"
          min="0"
          step="0.1"
          inputMode="decimal"
          placeholder="hours"
          value={numVal(hours)}
          onChange={(e) => onHours(Number(e.target.value) || 0)}
        />
      )}
    </label>
  );
}
