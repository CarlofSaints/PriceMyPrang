"use client";

import { useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { mediaPath, safeFileName } from "@/lib/mediaPath";
import { shortDate } from "@/lib/format";
import {
  DEV_PRIORITIES,
  DEV_TICKET_STATUSES,
  DEV_PRIORITY_LABEL,
  DEV_PRIORITY_SHORT,
  DEV_STATUS_LABEL,
  type DevPriority,
  type DevTicket,
  type DevTicketAttachment,
  type DevTicketNote,
  type DevTicketStats,
  type DevTicketStatus,
} from "@/lib/types";
import { Button, Field, inputClass } from "./ui";

/** A file already in Blob, waiting to be saved with the ticket. */
type PendingFile = {
  fileName: string;
  url: string;
  pathname: string;
  contentType?: string;
  size?: number;
};

const PRIORITY_STYLE: Record<DevPriority, string> = {
  urgent: "bg-coral/15 text-coral",
  must_do: "bg-amber/20 text-ink",
  nice_to_have: "bg-teal/10 text-teal",
};

const STATUS_STYLE: Record<DevTicketStatus, string> = {
  backlog: "bg-ink/5 text-ink/70",
  in_progress: "bg-teal/10 text-teal",
  done: "bg-teal/15 text-teal",
};

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** yyyy-mm-dd for today, in the browser's own timezone. */
function todayKey(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export default function DevPlanner({
  initialTickets,
  initialStats,
}: {
  initialTickets: DevTicket[];
  initialStats: DevTicketStats;
}) {
  const [tickets, setTickets] = useState(initialTickets);
  const [stats, setStats] = useState(initialStats);
  const [statusFilter, setStatusFilter] = useState<DevTicketStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<DevPriority | "all">("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Compose form
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [priority, setPriority] = useState<DevPriority>("must_do");
  const [remindOn, setRemindOn] = useState("");
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Editing an existing ticket. Only one card is ever in edit mode, so the
  // draft lives here rather than per-row.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDetail, setEditDetail] = useState("");

  // Note drafts are keyed by ticket — you can start a note on one card, scroll
  // off to read another, and come back to what you typed.
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteBusyId, setNoteBusyId] = useState<string | null>(null);

  const today = todayKey();

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (q && !`${t.title} ${t.detail ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tickets, statusFilter, priorityFilter, search]);

  const cards = [
    { key: "all" as const, label: "In pipeline", value: stats.open, accent: "bg-teal" },
    { key: "urgent" as const, label: "Urgent", value: stats.urgent, accent: "bg-coral" },
    { key: "must_do" as const, label: "Must be done", value: stats.mustDo, accent: "bg-amber" },
    {
      key: "nice_to_have" as const,
      label: "Nice to have",
      value: stats.niceToHave,
      accent: "bg-teal-light",
    },
  ];

  /** Re-reads counts from the server so the cards can't drift from the table. */
  async function refreshStats() {
    try {
      const res = await fetch("/api/dev-tickets");
      if (!res.ok) return;
      const data = (await res.json()) as { tickets: DevTicket[]; stats: DevTicketStats };
      setTickets(data.tickets);
      setStats(data.stats);
    } catch {
      // The table is already correct locally; stale cards are not worth an alarm.
    }
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    try {
      const uploaded: PendingFile[] = [];
      for (const file of Array.from(files)) {
        const blob = await upload(
          `dev-tickets/${Date.now()}-${safeFileName(file.name)}`,
          file,
          {
            access: "private",
            handleUploadUrl: "/api/dev-tickets/upload",
            contentType: file.type || "application/octet-stream",
          }
        );
        uploaded.push({
          fileName: file.name,
          url: mediaPath(blob.pathname),
          pathname: blob.pathname,
          contentType: file.type || undefined,
          size: file.size,
        });
      }
      setPending((list) => [...list, ...uploaded]);
    } catch (err) {
      setError(`Upload failed: ${(err as Error).message}`);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function resetForm() {
    setTitle("");
    setDetail("");
    setPriority("must_do");
    setRemindOn("");
    setPending([]);
    setOpen(false);
  }

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Give the ticket a title.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dev-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          detail,
          priority,
          remindOn: remindOn || undefined,
          attachments: pending,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not save the ticket");
      const ticket = (await res.json()) as DevTicket;
      setTickets((list) => [ticket, ...list]);
      resetForm();
      await refreshStats();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Returns whether the save stuck, so callers can keep an edit form open.
   *
   * `remindOn: null` clears the date. It has to be null rather than undefined:
   * JSON.stringify drops undefined keys entirely, and the API reads a missing
   * key as "leave this field alone" — so undefined could never clear anything.
   */
  async function patch(
    id: string,
    changes: Partial<Omit<DevTicket, "remindOn">> & { remindOn?: string | null }
  ): Promise<boolean> {
    const prev = tickets;
    // The optimistic copy carries the app's own shape, where "no date" is
    // undefined rather than the null we put on the wire.
    const { remindOn, ...rest } = changes;
    const local: Partial<DevTicket> = { ...rest };
    if (remindOn !== undefined) local.remindOn = remindOn ?? undefined;
    setTickets((list) => list.map((t) => (t.id === id ? { ...t, ...local } : t)));
    setError(null);
    try {
      const res = await fetch("/api/dev-tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...changes }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      const updated = (await res.json()) as DevTicket;
      setTickets((list) => list.map((t) => (t.id === updated.id ? updated : t)));
      await refreshStats();
      return true;
    } catch (err) {
      setTickets(prev); // put the row back the way it was
      setError((err as Error).message);
      return false;
    }
  }

  function startEdit(t: DevTicket) {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditDetail(t.detail ?? "");
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditDetail("");
  }

  /**
   * Saves the title/detail of an existing ticket. Sends `detail` even when it
   * is empty so clearing it actually clears it — the API treats undefined as
   * "leave alone", which would otherwise make the field impossible to empty.
   */
  async function saveEdit(id: string) {
    const next = editTitle.trim();
    if (!next) return setError("A ticket still needs a title.");
    setBusy(true);
    try {
      // Keep the form open if the save failed, or the typing is lost.
      if (await patch(id, { title: next, detail: editDetail.trim() })) cancelEdit();
    } finally {
      setBusy(false);
    }
  }

  async function addNote(ticketId: string) {
    const body = (noteDrafts[ticketId] ?? "").trim();
    if (!body) return;
    setNoteBusyId(ticketId);
    setError(null);
    try {
      const res = await fetch("/api/dev-tickets/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, body }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not add the note");
      const updated = (await res.json()) as DevTicket;
      setTickets((list) => list.map((t) => (t.id === updated.id ? updated : t)));
      // Only clear the box once the note is safely saved, so a failed send
      // doesn't lose what was typed.
      setNoteDrafts((d) => ({ ...d, [ticketId]: "" }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setNoteBusyId(null);
    }
  }

  async function removeNote(note: DevTicketNote) {
    if (!confirm(`Delete this note by ${note.createdByName}?`)) return;
    setError(null);
    try {
      const res = await fetch("/api/dev-tickets/notes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: note.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not delete the note");
      const updated = (await res.json()) as DevTicket;
      setTickets((list) => list.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(ticket: DevTicket) {
    if (
      !confirm(
        `Delete "${ticket.title}"?\n\nThis also deletes its ${ticket.attachments.length} attachment(s) and cannot be undone.`
      )
    )
      return;
    const prev = tickets;
    setTickets((list) => list.filter((t) => t.id !== ticket.id));
    try {
      const res = await fetch("/api/dev-tickets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ticket.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed");
      await refreshStats();
    } catch (err) {
      setTickets(prev);
      setError((err as Error).message);
    }
  }

  async function attachTo(ticketId: string, files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    try {
      const uploaded: PendingFile[] = [];
      for (const file of Array.from(files)) {
        const blob = await upload(
          `dev-tickets/${Date.now()}-${safeFileName(file.name)}`,
          file,
          {
            access: "private",
            handleUploadUrl: "/api/dev-tickets/upload",
            contentType: file.type || "application/octet-stream",
          }
        );
        uploaded.push({
          fileName: file.name,
          url: mediaPath(blob.pathname),
          pathname: blob.pathname,
          contentType: file.type || undefined,
          size: file.size,
        });
      }
      const res = await fetch("/api/dev-tickets/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, files: uploaded }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Attach failed");
      const updated = (await res.json()) as DevTicket;
      setTickets((list) => list.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function detach(ticketId: string, attachment: DevTicketAttachment) {
    if (!confirm(`Remove ${attachment.fileName}?`)) return;
    const prev = tickets;
    setTickets((list) =>
      list.map((t) =>
        t.id === ticketId
          ? { ...t, attachments: t.attachments.filter((a) => a.id !== attachment.id) }
          : t
      )
    );
    try {
      const res = await fetch("/api/dev-tickets/attachments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentId: attachment.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Could not remove the file");
    } catch (err) {
      setTickets(prev);
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      {/* ---- Cards. Clicking one filters the list to that priority. ---- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => {
          const active = priorityFilter === c.key || (c.key === "all" && priorityFilter === "all");
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => setPriorityFilter(c.key)}
              className={`pmp-card overflow-hidden p-0 text-left transition-shadow hover:shadow-md ${
                active ? "ring-2 ring-teal/40" : ""
              }`}
            >
              <div className={`h-1.5 ${c.accent}`} />
              <div className="p-5">
                <p className="text-sm text-ink/60">{c.label}</p>
                <p className="mt-1 font-display text-2xl font-bold text-ink">{c.value}</p>
              </div>
            </button>
          );
        })}
      </div>

      {stats.overdue > 0 && (
        <div className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-ink">
          <strong className="font-semibold">{stats.overdue}</strong>{" "}
          {stats.overdue === 1 ? "ticket has" : "tickets have"} a reminder date that has already
          passed.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
          {error}
        </div>
      )}

      {/* ---- Filters ---- */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tickets…"
          className="w-64 rounded-lg border border-ink/15 px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant={statusFilter === "all" ? "primary" : "outline"}
            onClick={() => setStatusFilter("all")}
          >
            All
          </Button>
          {DEV_TICKET_STATUSES.map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "primary" : "outline"}
              onClick={() => setStatusFilter(s)}
            >
              {DEV_STATUS_LABEL[s]}
            </Button>
          ))}
        </div>
        {(priorityFilter !== "all" || statusFilter !== "all" || search) && (
          <button
            type="button"
            className="text-sm text-teal underline"
            onClick={() => {
              setPriorityFilter("all");
              setStatusFilter("all");
              setSearch("");
            }}
          >
            Clear filters
          </button>
        )}
        <div className="ml-auto">
          <Button onClick={() => setOpen((v) => !v)}>
            {open ? "Cancel" : "+ New ticket"}
          </Button>
        </div>
      </div>

      {/* ---- Compose ---- */}
      {open && (
        <form onSubmit={createTicket} className="pmp-card space-y-4 p-5">
          <Field label="What needs doing" required>
            <input
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Split preview and production databases"
              autoFocus
            />
          </Field>

          <Field label="Detail" hint="What's wanted, and why. The why is the part that gets forgotten.">
            <textarea
              className={`${inputClass} min-h-28`}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Priority" required>
              <select
                className={inputClass}
                value={priority}
                onChange={(e) => setPriority(e.target.value as DevPriority)}
              >
                {DEV_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {DEV_PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Remind me on" hint="You'll get an email that morning. Leave blank for none.">
              <input
                type="date"
                className={inputClass}
                value={remindOn}
                min={today}
                onChange={(e) => setRemindOn(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Attachments" hint="Documents, screenshots, specs — up to 25MB each.">
            <input
              ref={fileInput}
              type="file"
              multiple
              onChange={(e) => addFiles(e.target.files)}
              className="block w-full text-sm text-ink/70 file:mr-3 file:rounded-full file:border-0 file:bg-teal/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-teal"
            />
          </Field>

          {uploading && <p className="text-sm text-ink/60">Uploading…</p>}

          {pending.length > 0 && (
            <ul className="space-y-1 text-sm">
              {pending.map((f) => (
                <li key={f.pathname} className="flex items-center gap-2">
                  <span className="text-ink/80">{f.fileName}</span>
                  <span className="text-xs text-ink/40">{formatSize(f.size)}</span>
                  <button
                    type="button"
                    className="text-xs text-coral underline"
                    onClick={() => setPending((l) => l.filter((p) => p.pathname !== f.pathname))}
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={busy || uploading}>
              {busy ? "Saving…" : "Add to pipeline"}
            </Button>
            <Button type="button" variant="ghost" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* ---- The pipeline ---- */}
      <div className="space-y-3">
        {visible.length === 0 && (
          <div className="pmp-card p-10 text-center text-ink/50">
            {tickets.length === 0
              ? "Nothing in the pipeline yet. Add the first ticket."
              : "No tickets match those filters."}
          </div>
        )}

        {visible.map((t) => {
          const overdue = !!t.remindOn && t.status !== "done" && t.remindOn < today;
          return (
            <div key={t.id} className="pmp-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${PRIORITY_STYLE[t.priority]}`}
                    >
                      {DEV_PRIORITY_SHORT[t.priority]}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[t.status]}`}
                    >
                      {DEV_STATUS_LABEL[t.status]}
                    </span>
                    {overdue && (
                      <span className="rounded-full bg-coral/15 px-2.5 py-1 text-xs font-semibold text-coral">
                        Overdue
                      </span>
                    )}
                  </div>

                  {editingId === t.id ? (
                    <div className="mt-2 space-y-3">
                      <Field label="What needs doing" required>
                        <input
                          className={inputClass}
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          autoFocus
                        />
                      </Field>
                      <Field label="Detail">
                        <textarea
                          className={`${inputClass} min-h-32`}
                          value={editDetail}
                          onChange={(e) => setEditDetail(e.target.value)}
                        />
                      </Field>
                      <div className="flex gap-2">
                        <Button type="button" disabled={busy} onClick={() => saveEdit(t.id)}>
                          {busy ? "Saving…" : "Save changes"}
                        </Button>
                        <Button type="button" variant="ghost" onClick={cancelEdit}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3
                        className={`mt-2 font-display text-lg font-semibold text-ink ${
                          t.status === "done" ? "line-through opacity-60" : ""
                        }`}
                      >
                        {t.title}
                      </h3>

                      {t.detail && (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-ink/70">{t.detail}</p>
                      )}
                    </>
                  )}

                  <p className="mt-2 text-xs text-ink/50">
                    Logged by {t.createdByName} on {shortDate(t.createdAt)}
                    {t.remindOn && (
                      <>
                        {" · "}
                        <span className={overdue ? "font-semibold text-coral" : ""}>
                          reminder {shortDate(t.remindOn)}
                        </span>
                      </>
                    )}
                    {t.completedAt && <> · done {shortDate(t.completedAt)}</>}
                  </p>

                  {t.attachments.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {t.attachments.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center gap-2 rounded-lg bg-ink/5 px-3 py-1.5 text-xs"
                        >
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-teal underline"
                          >
                            {a.fileName}
                          </a>
                          <span className="text-ink/40">{formatSize(a.size)}</span>
                          <button
                            type="button"
                            className="text-coral"
                            onClick={() => detach(t.id, a)}
                            aria-label={`Remove ${a.fileName}`}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* ---- Notes: the running conversation on this ticket ---- */}
                  <div className="mt-4 border-t border-ink/10 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">
                      Notes {t.notes.length > 0 && `(${t.notes.length})`}
                    </p>

                    {t.notes.length > 0 && (
                      <ul className="mt-2 space-y-2">
                        {t.notes.map((n) => (
                          <li key={n.id} className="rounded-lg bg-ink/[0.04] px-3 py-2">
                            <p className="whitespace-pre-wrap text-sm text-ink/80">{n.body}</p>
                            <p className="mt-1 flex items-center gap-2 text-xs text-ink/45">
                              <span>
                                {n.createdByName} · {shortDate(n.createdAt)}
                              </span>
                              <button
                                type="button"
                                className="text-coral underline"
                                onClick={() => removeNote(n)}
                              >
                                delete
                              </button>
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="mt-2 flex items-start gap-2">
                      <textarea
                        className="min-h-10 flex-1 rounded-lg border border-ink/15 px-3 py-2 text-sm"
                        rows={2}
                        placeholder="Add a note…"
                        value={noteDrafts[t.id] ?? ""}
                        onChange={(e) =>
                          setNoteDrafts((d) => ({ ...d, [t.id]: e.target.value }))
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={noteBusyId === t.id || !(noteDrafts[t.id] ?? "").trim()}
                        onClick={() => addNote(t.id)}
                      >
                        {noteBusyId === t.id ? "Adding…" : "Add note"}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex w-full flex-col items-stretch gap-2 sm:w-52">
                  {/* Labelled, because two bare dropdowns stacked together give
                      no clue which one is the status. */}
                  <label className="block text-xs font-semibold text-ink/50">
                    Priority
                    <select
                      className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm font-normal text-ink"
                      value={t.priority}
                      onChange={(e) => patch(t.id, { priority: e.target.value as DevPriority })}
                    >
                      {DEV_PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {DEV_PRIORITY_LABEL[p]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-xs font-semibold text-ink/50">
                    Status
                    <select
                      className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm font-normal text-ink"
                      value={t.status}
                      onChange={(e) => patch(t.id, { status: e.target.value as DevTicketStatus })}
                    >
                      {DEV_TICKET_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {DEV_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-xs font-semibold text-ink/50">
                    Remind me on
                    <input
                      type="date"
                      className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm font-normal text-ink"
                      value={t.remindOn ?? ""}
                      // null (not undefined) clears the date — undefined is
                      // dropped by JSON.stringify, which the API reads as
                      // "leave it alone", making a date impossible to remove.
                      onChange={(e) => patch(t.id, { remindOn: e.target.value || null })}
                    />
                  </label>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => (editingId === t.id ? cancelEdit() : startEdit(t))}
                  >
                    {editingId === t.id ? "Cancel edit" : "Edit"}
                  </Button>

                  <label className="cursor-pointer rounded-full border border-teal/30 bg-white px-4 py-2 text-center text-sm font-semibold text-ink hover:bg-teal/5">
                    Attach file
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        attachTo(t.id, e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    className="text-sm text-coral underline"
                    onClick={() => remove(t)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
