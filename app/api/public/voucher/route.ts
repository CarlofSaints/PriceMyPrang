import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { clientIp, limitOrRespond } from "@/lib/rateLimit";
import { parseJson } from "@/lib/validate";
import { VoucherApplyBody } from "@/lib/schemas/public";
import { requestFee } from "@/lib/ozow";
import { discountedFee, normaliseVoucherCode, voucherProblem } from "@/lib/vouchers";
import { logActivity, consumerActor } from "@/lib/activityLog";

// PUBLIC: the customer typing a voucher code on /pay/[token]. The request's
// publicToken is the only credential. This only REMEMBERS the voucher on the
// request: the price is worked out again, and the voucher checked again, when
// they press Pay (lib/payments.ts startPayment). An empty code takes it off.
//
// With NO token it only CHECKS a code (the quote form, before the request
// exists) and changes nothing. Same rate limit, so it's no better for guessing.
export async function POST(request: Request) {
  const limited = await limitOrRespond("voucherApply", clientIp(request));
  if (limited) return limited;

  const parsed = await parseJson(request, VoucherApplyBody, "POST /api/public/voucher");
  if (parsed.response) return parsed.response;
  const { token, code } = parsed.data;
  const db = getDb();

  if (!token) {
    const voucher = await db.voucher.findUnique({ where: { code: normaliseVoucherCode(code ?? "") } });
    const problem = voucherProblem(voucher);
    if (problem || !voucher) return NextResponse.json({ error: problem }, { status: 400 });
    const fee = requestFee();
    return NextResponse.json({ fee, amount: discountedFee(fee, voucher.percentOff), voucher: { code: voucher.code, percentOff: voucher.percentOff } });
  }

  const req = await db.quoteRequest.findUnique({
    where: { publicToken: token },
    select: { id: true, reference: true, firstName: true, lastName: true, email: true, repairerInitiated: true },
  });
  if (!req || req.repairerInitiated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // An Ozow link already opened at the old price is fine: Pay only reuses a
  // link whose amount matches, so a changed price opens a new one.
  if (await db.payment.count({ where: { requestId: req.id, status: "paid" } }))
    return NextResponse.json({ error: "This request is already paid." }, { status: 409 });

  const fee = requestFee();
  const typed = normaliseVoucherCode(code ?? "");
  if (!typed) {
    await db.quoteRequest.update({ where: { id: req.id }, data: { voucherId: null } });
    return NextResponse.json({ fee, amount: fee, voucher: null });
  }

  const voucher = await db.voucher.findUnique({ where: { code: typed } });
  const problem = voucherProblem(voucher);
  if (problem || !voucher) {
    await logActivity({
      action: "voucher.refused",
      summary: `Voucher "${typed.slice(0, 40)}" refused on ${req.reference}: ${problem}`,
      outcome: "denied",
      entityType: "request",
      entityId: req.reference,
      entityLabel: req.reference,
      ...consumerActor(`${req.firstName} ${req.lastName}`, req.email),
      request,
    });
    return NextResponse.json({ error: problem }, { status: 400 });
  }

  await db.quoteRequest.update({ where: { id: req.id }, data: { voucherId: voucher.id } });
  await logActivity({
    action: "voucher.apply",
    summary: `${req.firstName} ${req.lastName} applied voucher ${voucher.code} (${voucher.percentOff}% off) to ${req.reference}`,
    entityType: "request",
    entityId: req.reference,
    entityLabel: req.reference,
    ...consumerActor(`${req.firstName} ${req.lastName}`, req.email),
    request,
    detail: { voucherId: voucher.id, code: voucher.code, percentOff: voucher.percentOff },
  });
  return NextResponse.json({
    fee,
    amount: discountedFee(fee, voucher.percentOff),
    voucher: { code: voucher.code, percentOff: voucher.percentOff },
  });
}
