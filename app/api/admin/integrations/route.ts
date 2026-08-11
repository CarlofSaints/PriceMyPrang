import { NextResponse } from "next/server";
import { requireUser, verifyPassword } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  getIntegrationSecretMeta,
  getIntegrationKey,
  setIntegrationSecret,
  deleteIntegrationSecret,
} from "@/lib/store";
import { encryptSecret, maskSecret } from "@/lib/secrets";
import { logActivity, actorFromUser } from "@/lib/activityLog";

// Third-party API keys entered in the portal. Two gates on every write and on
// the reveal: the Super Admin permission, AND the caller re-typing their own
// password. The session alone is not enough — a borrowed unlocked screen must
// not be able to read out or swap a billable credential.

/** The integrations we accept a key for. Anything else is rejected outright. */
const KNOWN = new Set(["imagin8"]);

async function requireManage() {
  const { user, response } = await requireUser();
  if (response) return { error: response };
  if (!can(user, "manage_integrations"))
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

/** Metadata only — masked value, who set it, when. Never the key. */
export async function GET() {
  const gate = await requireManage();
  if (gate.error) return gate.error;

  const meta = await getIntegrationSecretMeta("imagin8");
  // A row that exists but won't decrypt means SESSION_SECRET was rotated. Say
  // so plainly, or the admin sees "configured" and cannot work out why every
  // lookup fails.
  const readable = meta ? (await getIntegrationKey("imagin8")) !== null : true;

  return NextResponse.json({
    imagin8: meta ? { ...meta, readable } : null,
  });
}

export async function POST(request: Request) {
  const gate = await requireManage();
  if (gate.error) return gate.error;

  const b = (await request.json()) as {
    action?: "save" | "reveal";
    id?: string;
    key?: string;
    clientId?: string;
    password?: string;
  };

  const id = b.id ?? "imagin8";
  if (!KNOWN.has(id)) return NextResponse.json({ error: "Unknown integration" }, { status: 400 });

  if (!b.password)
    return NextResponse.json({ error: "Your password is required" }, { status: 400 });

  // Re-verify against the caller's OWN password, the same guard the
  // change-password endpoint uses.
  if (!(await verifyPassword(b.password, gate.user.passwordHash))) {
    await logActivity({
      action: "integration.password_failed",
      summary: `${gate.user.name} gave the wrong password trying to ${b.action === "reveal" ? "reveal" : "save"} the ${id} key`,
      outcome: "denied",
      status: 403,
      entityType: "integration",
      entityId: id,
      entityLabel: id,
      ...actorFromUser(gate.user),
      request,
    });
    return NextResponse.json({ error: "That password is not correct" }, { status: 403 });
  }

  if (b.action === "reveal") {
    const key = await getIntegrationKey(id);
    // Reading a billable credential back out in plaintext is the most sensitive
    // thing this application can do, so it is recorded whether or not it
    // succeeded. The KEY itself is of course never written here.
    await logActivity({
      action: "integration.reveal",
      summary:
        key === null
          ? `${gate.user.name} tried to reveal the ${id} API key, but none could be decrypted`
          : `${gate.user.name} revealed the ${id} API key`,
      outcome: key === null ? "failed" : "success",
      status: key === null ? 404 : 200,
      entityType: "integration",
      entityId: id,
      entityLabel: id,
      ...actorFromUser(gate.user),
      request,
    });
    if (key === null)
      return NextResponse.json(
        { error: "No key stored, or it can no longer be decrypted. Enter it again." },
        { status: 404 }
      );
    return NextResponse.json({ key });
  }

  const key = typeof b.key === "string" ? b.key.trim() : "";
  if (!key) return NextResponse.json({ error: "Paste the API key" }, { status: 400 });

  // Browsers read this page as a login form and have been seen filling the key
  // box with the saved username. A whole-string email is never an API key, and
  // catching it here beats discovering it as a 401 from imagin8 weeks later.
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key))
    return NextResponse.json(
      { error: "That looks like an email address, not an API key — check the field was not autofilled." },
      { status: 400 }
    );

  // imagin8 issue a client ID alongside the key. It's an identifier, not a
  // secret, so it is stored in the clear and shown back for confirmation.
  const clientId = typeof b.clientId === "string" ? b.clientId.trim() : "";

  await setIntegrationSecret(
    id,
    { ...encryptSecret(key), masked: maskSecret(key), clientId: clientId || undefined },
    gate.user.name
  );

  await logActivity({
    action: "integration.save",
    summary: `${gate.user.name} saved the ${id} API key (${maskSecret(key)})`,
    entityType: "integration",
    entityId: id,
    entityLabel: id,
    ...actorFromUser(gate.user),
    // The MASK, never the key. The client ID is an identifier, not a secret.
    detail: { masked: maskSecret(key), clientId: clientId || undefined },
    request,
  });

  return NextResponse.json({ ok: true, masked: maskSecret(key), clientId: clientId || undefined });
}

export async function DELETE(request: Request) {
  const gate = await requireManage();
  if (gate.error) return gate.error;

  const { id, password } = (await request.json()) as { id?: string; password?: string };
  if (!password) return NextResponse.json({ error: "Your password is required" }, { status: 400 });
  if (!(await verifyPassword(password, gate.user.passwordHash)))
    return NextResponse.json({ error: "That password is not correct" }, { status: 403 });

  await deleteIntegrationSecret(id ?? "imagin8");

  await logActivity({
    action: "integration.delete",
    summary: `${gate.user.name} removed the ${id ?? "imagin8"} API key`,
    entityType: "integration",
    entityId: id ?? "imagin8",
    entityLabel: id ?? "imagin8",
    ...actorFromUser(gate.user),
    request,
  });

  return NextResponse.json({ ok: true });
}
