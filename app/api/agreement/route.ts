import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  addAgreementDocument,
  listAgreementDocuments,
  deleteAgreementDocument,
} from "@/lib/store";
import { uploadMedia } from "@/lib/blob";
import type { AgreementDocument } from "@/lib/types";

export const maxDuration = 60;

// Managing the repairer agreement is a Super Admin job — it's the contract the
// whole network signs.
async function requireSuperAdmin() {
  const { user, response } = await requireUser();
  if (response) return { error: response };
  if (!can(user, "manage_panel_beaters"))
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return gate.error;
  return NextResponse.json(await listAgreementDocuments());
}

/**
 * Upload a new agreement. The .docx is converted to HTML so the signing page
 * shows the real thing rather than a link nobody opens, and the original file
 * is kept alongside it as the source of truth.
 */
export async function POST(request: Request) {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return gate.error;

  const form = await request.formData();
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();

  if (!(file instanceof File))
    return NextResponse.json({ error: "Choose a .docx file to upload" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".docx"))
    return NextResponse.json(
      { error: "Only .docx files are supported — export from Word." },
      { status: 400 }
    );

  const buffer = Buffer.from(await file.arrayBuffer());

  let html: string;
  try {
    const result = await mammoth.convertToHtml({ buffer });
    html = result.value;
  } catch {
    return NextResponse.json(
      { error: "Couldn't read that document. Re-save it as .docx and try again." },
      { status: 400 }
    );
  }
  if (!html.trim())
    return NextResponse.json({ error: "That document appears to be empty." }, { status: 400 });

  const stamp = Date.now();
  const safeName = file.name.replace(/[^a-z0-9.]+/gi, "-").toLowerCase();
  const { url, pathname } = await uploadMedia(
    `agreements/${stamp}-${safeName}`,
    buffer,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );

  const doc: AgreementDocument = {
    id: crypto.randomUUID(),
    title: title || file.name.replace(/\.docx$/i, ""),
    html,
    sourceUrl: url,
    sourcePathname: pathname,
    active: true,
    uploadedByName: gate.user.name,
    createdAt: new Date().toISOString(),
  };

  // Makes this the active one and stands the previous version down.
  await addAgreementDocument(doc);

  return NextResponse.json({ ok: true, document: doc });
}

export async function DELETE(request: Request) {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return gate.error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const result = await deleteAgreementDocument(id);
  if (!result.ok)
    return NextResponse.json(
      {
        error:
          "Repairers have already signed this version, so it can't be deleted — upload a new one instead and this becomes history.",
      },
      { status: 409 }
    );

  return NextResponse.json({ ok: true });
}
