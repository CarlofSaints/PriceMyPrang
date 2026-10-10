import { z } from "zod";
import { DEV_PRIORITIES, DEV_TICKET_STATUSES, type DevPriority, type DevTicketStatus } from "../types";

// Request bodies for /api/dev-tickets/*. See lib/validate.ts for why every
// object here is strict. /api/dev-tickets/upload is NOT here: its body is
// @vercel/blob's own HandleUploadBody protocol, which the vendor owns.

const id = z.string().max(200);
const priority = z.enum(DEV_PRIORITIES as [DevPriority, ...DevPriority[]]);
const status = z.enum(DEV_TICKET_STATUSES as [DevTicketStatus, ...DevTicketStatus[]]);

/**
 * A file already uploaded to Blob, as DevPlanner's PendingFile.
 *
 * Never set: id, ticketId, createdAt. A row is minted per file server-side.
 */
export const DevTicketFile = z.strictObject({
  fileName: z.string().max(500).optional(),
  url: z.string().max(2000).optional(),
  pathname: z.string().max(1000).optional(),
  contentType: z.string().max(200).optional(),
  size: z.number().optional(),
});

/**
 * POST /api/dev-tickets: log a ticket.
 *
 * `remindOn` stays a free string: the route's dateOf() already treats anything
 * that isn't yyyy-mm-dd as "no date" rather than refusing the ticket.
 *
 * Never set: id, createdById / createdByName / createdByEmail (from the
 * session, so a ticket can't claim another author), createdAt, updatedAt,
 * completedAt, reminderSentAt, notes.
 */
export const CreateDevTicketBody = z.strictObject({
  title: z.string().max(500).optional(),
  detail: z.string().max(20000).optional(),
  priority: priority.optional(),
  status: status.optional(),
  remindOn: z.string().max(20).optional(),
  attachments: z.array(DevTicketFile).max(100).optional(),
});

/**
 * PATCH /api/dev-tickets: change one or more fields. A missing key means
 * "leave alone"; `remindOn: null` clears the date.
 *
 * Never set: the same author and timestamp fields as create, plus attachments
 * and notes (they have their own routes).
 */
export const UpdateDevTicketBody = z.strictObject({
  id: id.optional(),
  title: z.string().max(500).optional(),
  detail: z.string().max(20000).nullable().optional(),
  priority: priority.optional(),
  status: status.optional(),
  remindOn: z.string().max(20).nullable().optional(),
});

/** DELETE /api/dev-tickets. Never set: anything but the id. */
export const DeleteDevTicketBody = z.strictObject({
  id: id.optional(),
});

/** POST /api/dev-tickets/attachments. Never set: see DevTicketFile. */
export const AddDevTicketAttachmentsBody = z.strictObject({
  ticketId: id.optional(),
  files: z.array(DevTicketFile).max(100).optional(),
});

/** DELETE /api/dev-tickets/attachments. Never set: anything but the id. */
export const DeleteDevTicketAttachmentBody = z.strictObject({
  attachmentId: id.optional(),
});

/**
 * POST /api/dev-tickets/notes.
 *
 * Never set: createdById / createdByName / createdByEmail (from the session,
 * so a note can't be made to look like someone else wrote it), createdAt.
 */
export const AddDevTicketNoteBody = z.strictObject({
  ticketId: id.optional(),
  body: z.string().max(20000).optional(),
});

/** DELETE /api/dev-tickets/notes. Never set: anything but the id. */
export const DeleteDevTicketNoteBody = z.strictObject({
  noteId: id.optional(),
});
