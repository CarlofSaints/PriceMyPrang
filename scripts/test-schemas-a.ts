// Proves the strict request schemas for additionals, admin (integrations and
// agreement), auth, complaints and dev tickets.
// Run: npx tsx --test scripts/test-schemas-a.ts
//
// For every schema, three things: what the UI really sends today passes (so the
// schema never breaks the app), the same payload with a stray key fails (so it
// really is strict), and each field a user must never set fails (so ownership,
// authorship, totals and timestamps can't be smuggled in).

import { test } from "node:test";
import assert from "node:assert/strict";
import type { z } from "zod";
import {
  AdditionalLine,
  SaveAdditionalBody,
  AdditionalStatusBody,
  SendAdditionalBody,
} from "../lib/schemas/additionals";
import { IntegrationBody, DeleteIntegrationBody, AgreementUploadForm } from "../lib/schemas/admin";
import {
  LoginBody,
  VerifyOtpBody,
  ChangePasswordBody,
  TwoFactorBody,
  VerifyEmailBody,
} from "../lib/schemas/auth";
import { ComplaintStatusBody, ComplaintNoteBody } from "../lib/schemas/complaints";
import {
  DevTicketFile,
  CreateDevTicketBody,
  UpdateDevTicketBody,
  DeleteDevTicketBody,
  AddDevTicketAttachmentsBody,
  DeleteDevTicketAttachmentBody,
  AddDevTicketNoteBody,
  DeleteDevTicketNoteBody,
} from "../lib/schemas/devTickets";

type Case = {
  name: string;
  schema: z.ZodType;
  /** Copied from the client's fetch body (one per real call shape). */
  valid: Record<string, unknown>[];
  neverSet: string[];
};

// AdditionalsManager's emptyLine, then a saved line read back via toLineItem.
const blankLine = {
  code: "",
  description: "Front bumper",
  quantity: 1,
  partsAmount: 0,
  panelAmount: 0,
  panelHours: 0,
  paintAmount: 0,
  paintHours: 0,
  stripAmount: 0,
  stripHours: 0,
};
const savedLine = {
  code: "Repair",
  description: "Left wing",
  quantity: 2,
  partsCost: 900,
  partsAmount: 1150.5,
  supplierId: "sup-1",
  supplier: "Parts Co",
  panelCode: "P1",
  panelAmount: 400,
  panelHours: 2,
  paintCode: "PT",
  paintAmount: 300,
  paintHours: 1.5,
  stripCode: "S",
  stripAmount: 100,
  stripHours: 0.5,
};

// DevPlanner's PendingFile, after an upload.
const pendingFile = {
  fileName: "screenshot.png",
  url: "/api/media/dev-tickets/123-screenshot-abc.png",
  pathname: "dev-tickets/123-screenshot-abc.png",
  contentType: "image/png",
  size: 48213,
};

const cases: Case[] = [
  {
    name: "AdditionalLine",
    schema: AdditionalLine,
    valid: [blankLine, savedLine],
    neverSet: ["id", "additionalId", "sortOrder", "total"],
  },
  {
    name: "SaveAdditionalBody (POST /api/additionals)",
    schema: SaveAdditionalBody,
    valid: [
      // New draft: draftId undefined is dropped by JSON.stringify.
      {
        reference: "PMP-1234",
        panelBeaterId: "pb-1",
        reason: "",
        claimNumber: "CLM-99",
        lines: [blankLine],
      },
      {
        id: "add-1",
        reference: "PMP-1234",
        panelBeaterId: "pb-1",
        reason: "Hidden damage behind the bumper",
        claimNumber: "",
        lines: [savedLine, blankLine],
      },
    ],
    neverSet: [
      "requestId",
      "seq",
      "status",
      "partsTotal",
      "subtotal",
      "vat",
      "total",
      "sentAt",
      "sentToEmail",
      "createdAt",
      "createdByName",
    ],
  },
  {
    name: "AdditionalStatusBody (PATCH /api/additionals)",
    schema: AdditionalStatusBody,
    valid: [
      { id: "add-1", panelBeaterId: "pb-1", status: "pending" },
      { id: "add-1", panelBeaterId: "pb-1", status: "approved", responseNote: "OK by phone" },
    ],
    neverSet: ["respondedAt", "total", "seq", "sentAt"],
  },
  {
    name: "SendAdditionalBody (POST /api/additionals/send)",
    schema: SendAdditionalBody,
    valid: [
      { id: "add-1", panelBeaterId: "pb-1", contactId: "c-1", notifyClient: true },
      { id: "add-1", panelBeaterId: "pb-1", email: "claims@insurer.co.za", notifyClient: false },
    ],
    neverSet: ["sentAt", "sentToName", "clientEmail", "insurerSent", "clientSent"],
  },
  {
    name: "IntegrationBody (POST /api/admin/integrations)",
    schema: IntegrationBody,
    valid: [
      { action: "save", id: "imagin8", key: "sk_live_abc", clientId: "", password: "pw" },
      { action: "reveal", id: "imagin8", password: "pw" },
    ],
    neverSet: ["masked", "ciphertext", "iv", "tag", "updatedAt", "updatedByName"],
  },
  {
    name: "DeleteIntegrationBody (DELETE /api/admin/integrations)",
    schema: DeleteIntegrationBody,
    valid: [{ id: "imagin8", password: "pw" }],
    neverSet: ["masked", "updatedByName"],
  },
  {
    name: "AgreementUploadForm (POST /api/agreement)",
    schema: AgreementUploadForm,
    valid: [
      { file: new File(["x"], "agreement.docx") },
      { file: new File(["x"], "agreement.docx"), title: "2026 agreement" },
    ],
    neverSet: [
      "id",
      "html",
      "sourceUrl",
      "sourcePathname",
      "active",
      "uploadedByName",
      "createdAt",
    ],
  },
  {
    name: "LoginBody (POST /api/auth/login)",
    schema: LoginBody,
    valid: [{ email: "a@b.co.za", password: "correct horse" }],
    neverSet: ["role", "active", "twoFactorEnabled", "mustChangePassword", "userId"],
  },
  {
    name: "VerifyOtpBody (POST /api/auth/verify-otp)",
    schema: VerifyOtpBody,
    valid: [{ challengeId: "ch-1", code: "123456" }],
    neverSet: ["userId", "attempts", "codeHash"],
  },
  {
    name: "ChangePasswordBody (POST /api/auth/change-password)",
    schema: ChangePasswordBody,
    valid: [{ currentPassword: "old one", newPassword: "a much longer one" }],
    neverSet: ["userId", "passwordHash", "mustChangePassword"],
  },
  {
    name: "TwoFactorBody (POST /api/auth/two-factor)",
    schema: TwoFactorBody,
    valid: [
      { enabled: true, password: "pw" },
      { enabled: false, password: "pw" },
    ],
    neverSet: ["userId", "role", "permissions"],
  },
  {
    name: "VerifyEmailBody (POST /api/auth/verify-email)",
    schema: VerifyEmailBody,
    valid: [{ resend: true }, { token: "tok-abc" }],
    neverSet: ["userId", "email", "emailVerifiedAt"],
  },
  {
    name: "ComplaintStatusBody (PATCH /api/complaints)",
    schema: ComplaintStatusBody,
    valid: [{ id: "cmp-1", status: "in_progress" }],
    neverSet: ["panelBeaterId", "reference", "createdAt", "updatedAt"],
  },
  {
    name: "ComplaintNoteBody (POST /api/complaints)",
    schema: ComplaintNoteBody,
    valid: [
      { id: "cmp-1", body: "Called the client, redoing the paint", internal: false },
      { id: "cmp-1", body: "Repeat offender", internal: true },
    ],
    neverSet: ["authorName", "createdAt", "panelBeaterId"],
  },
  {
    name: "DevTicketFile",
    schema: DevTicketFile,
    valid: [pendingFile, { fileName: "notes.txt", url: "/x", pathname: "x", size: 3 }],
    neverSet: ["id", "ticketId", "createdAt"],
  },
  {
    name: "CreateDevTicketBody (POST /api/dev-tickets)",
    schema: CreateDevTicketBody,
    valid: [
      { title: "Fix it", detail: "", priority: "must_do", attachments: [] },
      {
        title: "Fix it",
        detail: "Steps",
        priority: "urgent",
        remindOn: "2026-10-20",
        attachments: [pendingFile],
      },
    ],
    neverSet: [
      "id",
      "createdById",
      "createdByName",
      "createdByEmail",
      "createdAt",
      "updatedAt",
      "completedAt",
      "reminderSentAt",
      "notes",
    ],
  },
  {
    name: "UpdateDevTicketBody (PATCH /api/dev-tickets)",
    schema: UpdateDevTicketBody,
    valid: [
      { id: "t-1", title: "Renamed", detail: "" },
      { id: "t-1", priority: "nice_to_have" },
      { id: "t-1", status: "done" },
      { id: "t-1", remindOn: "2026-11-01" },
      { id: "t-1", remindOn: null },
    ],
    neverSet: [
      "createdById",
      "createdByName",
      "createdByEmail",
      "createdAt",
      "updatedAt",
      "completedAt",
      "reminderSentAt",
      "attachments",
      "notes",
    ],
  },
  {
    name: "DeleteDevTicketBody (DELETE /api/dev-tickets)",
    schema: DeleteDevTicketBody,
    valid: [{ id: "t-1" }],
    neverSet: ["title", "createdByName"],
  },
  {
    name: "AddDevTicketAttachmentsBody (POST /api/dev-tickets/attachments)",
    schema: AddDevTicketAttachmentsBody,
    valid: [{ ticketId: "t-1", files: [pendingFile] }],
    neverSet: ["id", "createdAt", "createdByName"],
  },
  {
    name: "DeleteDevTicketAttachmentBody (DELETE /api/dev-tickets/attachments)",
    schema: DeleteDevTicketAttachmentBody,
    valid: [{ attachmentId: "att-1" }],
    neverSet: ["ticketId", "pathname"],
  },
  {
    name: "AddDevTicketNoteBody (POST /api/dev-tickets/notes)",
    schema: AddDevTicketNoteBody,
    valid: [{ ticketId: "t-1", body: "Handed to Sam" }],
    neverSet: ["createdById", "createdByName", "createdByEmail", "createdAt"],
  },
  {
    name: "DeleteDevTicketNoteBody (DELETE /api/dev-tickets/notes)",
    schema: DeleteDevTicketNoteBody,
    valid: [{ noteId: "n-1" }],
    neverSet: ["ticketId", "createdByName"],
  },
];

for (const c of cases) {
  test(`${c.name}: the payloads the UI sends pass`, () => {
    for (const body of c.valid) {
      const r = c.schema.safeParse(body);
      assert.ok(r.success, `${JSON.stringify(body)} -> ${r.success ? "" : r.error.message}`);
    }
  });

  test(`${c.name}: an unknown key fails`, () => {
    for (const body of c.valid) {
      assert.equal(c.schema.safeParse({ ...body, sneaky: "x" }).success, false);
    }
  });

  test(`${c.name}: every never-set field fails`, () => {
    for (const field of c.neverSet) {
      assert.equal(
        c.schema.safeParse({ ...c.valid[0], [field]: "x" }).success,
        false,
        `${field} was accepted`
      );
    }
  });
}

// Strictness has to reach INSIDE arrays, or a stray key just moves one level
// down. These are the nested objects a client could otherwise pad.
test("a stray key inside an additionals line fails the whole save", () => {
  const r = SaveAdditionalBody.safeParse({
    reference: "PMP-1",
    lines: [{ ...blankLine, total: 999999 }],
  });
  assert.equal(r.success, false);
});

test("a stray key inside a dev ticket attachment fails", () => {
  assert.equal(
    CreateDevTicketBody.safeParse({ title: "x", attachments: [{ ...pendingFile, id: "a" }] }).success,
    false
  );
  assert.equal(
    AddDevTicketAttachmentsBody.safeParse({ ticketId: "t", files: [{ ...pendingFile, ticketId: "other" }] })
      .success,
    false
  );
});

test("an unknown dev ticket priority or status fails", () => {
  assert.equal(UpdateDevTicketBody.safeParse({ id: "t", priority: "whenever" }).success, false);
  assert.equal(UpdateDevTicketBody.safeParse({ id: "t", status: "archived" }).success, false);
});

test("a repeated agreement form key fails rather than one copy being trusted", () => {
  assert.equal(AgreementUploadForm.safeParse({ title: ["a", "b"] }).success, false);
});

test("an empty body still parses, so routes keep their own 'X required' replies", () => {
  for (const s of [LoginBody, ChangePasswordBody, VerifyOtpBody, ComplaintNoteBody, AddDevTicketNoteBody]) {
    assert.ok(s.safeParse({}).success);
  }
});
