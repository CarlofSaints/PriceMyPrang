import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getParts, saveParts } from "@/lib/store";
import { netPrice, type Part } from "@/lib/types";

export const maxDuration = 60;

function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("");
    if (o.text != null) return String(o.text);
    if (o.result != null) return String(o.result);
    return "";
  }
  return String(v).trim();
}

function cellNum(v: ExcelJS.CellValue): number {
  const t = cellText(v).replace(/[^0-9.\-]/g, "");
  return Number(t) || 0;
}

// Map a header cell to one of our known fields.
function fieldFor(header: string): keyof ImportRow | null {
  const h = norm(header);
  if (h.includes("partnumber") || h === "partno" || h === "sku") return "partNumber";
  if (h.includes("description") || h.includes("partname") || h === "name") return "name";
  if (h.includes("category")) return "category";
  if (h.includes("listprice") || h === "price") return "listPrice";
  if (h.includes("discount")) return "discount";
  if (h.includes("leadtime")) return "leadTime";
  return null;
}

interface ImportRow {
  partNumber: string;
  name: string;
  category: string;
  listPrice: number;
  discount: number;
  leadTime: string;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(user, "manage_parts"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await request.formData();
  const supplier = String(form.get("supplier") || "").trim();
  const file = form.get("file");
  if (!supplier) return NextResponse.json({ error: "Supplier is required" }, { status: 400 });
  if (!(file instanceof File))
    return NextResponse.json({ error: "An Excel file is required" }, { status: 400 });

  let ws: ExcelJS.Worksheet | undefined;
  try {
    const wb = new ExcelJS.Workbook();
    const buf = Buffer.from(await file.arrayBuffer());
    // exceljs's bundled Buffer type conflicts with the newer @types/node Buffer generic
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buf as any);
    ws = wb.worksheets[0];
  } catch {
    return NextResponse.json({ error: "Could not read that Excel file" }, { status: 400 });
  }
  if (!ws) return NextResponse.json({ error: "The spreadsheet has no sheets" }, { status: 400 });

  // Build a column-index → field map from the header row.
  const headerRow = ws.getRow(1);
  const colMap: Record<number, keyof ImportRow> = {};
  headerRow.eachCell((cell, col) => {
    const f = fieldFor(cellText(cell.value));
    if (f) colMap[col] = f;
  });
  if (!Object.values(colMap).includes("name")) {
    return NextResponse.json(
      { error: "Couldn't find a 'Part Name - Description' column. Use the template." },
      { status: 400 }
    );
  }

  const parts = await getParts();
  let added = 0;
  const errors: string[] = [];

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const data: ImportRow = {
      partNumber: "",
      name: "",
      category: "",
      listPrice: 0,
      discount: 0,
      leadTime: "",
    };
    for (const [colStr, field] of Object.entries(colMap)) {
      const val = row.getCell(Number(colStr)).value;
      if (field === "listPrice" || field === "discount") {
        data[field] = cellNum(val);
      } else {
        data[field] = cellText(val);
      }
    }
    if (!data.name.trim()) continue; // skip blank rows

    parts.push({
      id: crypto.randomUUID(),
      supplier,
      partNumber: data.partNumber.trim() || undefined,
      name: data.name.trim(),
      category: data.category.trim() || undefined,
      listPrice: data.listPrice,
      discountPercentage: data.discount || undefined,
      price: netPrice(data.listPrice, data.discount),
      avgLeadTime: data.leadTime.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    added++;
  }

  if (added === 0) {
    return NextResponse.json(
      { error: "No parts found in the file (need at least a Part Name in each row)." },
      { status: 400 }
    );
  }

  await saveParts(parts);
  return NextResponse.json({ added, supplier, total: parts.length, errors });
}
