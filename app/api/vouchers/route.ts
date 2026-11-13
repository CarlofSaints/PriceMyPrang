import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getDb } from "@/lib/db";
import { logActivity, actorFromUser } from "@/lib/activityLog";
import { parseJson } from "@/lib/validate";
import { VoucherCreateBody, VoucherUpdateBody } from "@/lib/schemas/vouchers";
import { endOfDaySA, generateVoucherCode } from "@/lib/vouchers";

// Super Admin only: discount vouchers on the customer's request fee.

async function gate() {
  const { user, response } = await requireUser();
  if (response) return { error: response };
  if (!can(user, "manage_vouchers")) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const g = await gate();
  if (g.error) return g.error;
  const vouchers = await getDb().voucher.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  return NextResponse.json(vouchers);
}

export async function POST(request: Request) {
  const g = await gate();
  if (g.error) return g.error;
  const parsed = await parseJson(request, VoucherCreateBody, "POST /api/vouchers");
  if (parsed.response) return parsed.response;
  const b = parsed.data;

  const expiresAt = endOfDaySA(b.expiresOn);
  if (Number.isNaN(expiresAt.getTime())) return NextResponse.json({ error: "Pick a valid expiry date" }, { status: 400 });
  if (expiresAt.getTime() < Date.now()) return NextResponse.json({ error: "The expiry date is already past" }, { status: 400 });

  // A clash on the unique code is about one in 887 million: just try another.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const voucher = await getDb().voucher.create({
        data: {
          code: generateVoucherCode(),
          percentOff: b.percentOff,
          expiresAt,
          maxUses: b.maxUses,
          note: b.note?.trim() || null,
          createdByName: g.user.name,
        },
      });
      await logActivity({
        action: "voucher.create",
        summary: `${g.user.name} made voucher ${voucher.code}: ${voucher.percentOff}% off, ${voucher.maxUses === 1 ? "single use" : `${voucher.maxUses} uses`}, expires ${b.expiresOn}`,
        entityType: "voucher",
        entityId: voucher.id,
        entityLabel: voucher.code,
        ...actorFromUser(g.user),
        request,
        detail: { percentOff: voucher.percentOff, maxUses: voucher.maxUses, expiresOn: b.expiresOn, note: voucher.note },
      });
      return NextResponse.json(voucher);
    } catch (err) {
      if ((err as { code?: string })?.code !== "P2002") throw err;
    }
  }
  return NextResponse.json({ error: "Couldn't make a unique code, please try again" }, { status: 500 });
}

export async function PATCH(request: Request) {
  const g = await gate();
  if (g.error) return g.error;
  const parsed = await parseJson(request, VoucherUpdateBody, "PATCH /api/vouchers");
  if (parsed.response) return parsed.response;
  const { id, active } = parsed.data;

  const db = getDb();
  const before = await db.voucher.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const voucher = await db.voucher.update({ where: { id }, data: { active } });
  if (before.active !== active) {
    await logActivity({
      action: active ? "voucher.enable" : "voucher.disable",
      summary: `${g.user.name} switched voucher ${voucher.code} ${active ? "back on" : "off"}`,
      entityType: "voucher",
      entityId: voucher.id,
      entityLabel: voucher.code,
      ...actorFromUser(g.user),
      request,
    });
  }
  return NextResponse.json(voucher);
}
