import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

// Downloadable Excel template for bulk parts import.
// Supplier is NOT a column — it's chosen at import time and applied to every row.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user, "manage_parts")) return new Response("Forbidden", { status: 403 });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Parts");
  ws.columns = [
    { header: "Part number", key: "partNumber", width: 20 },
    { header: "Part Name - Description", key: "name", width: 44 },
    { header: "Part Category", key: "category", width: 20 },
    { header: "List Price", key: "listPrice", width: 14 },
    { header: "Discount Percentage", key: "discount", width: 20 },
    { header: "Ave Lead time", key: "leadTime", width: 16 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF00848D" },
  };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  // Two example rows to show the expected format.
  ws.addRow({
    partNumber: "FB-RANGER-20",
    name: "Front Bumper — Ford Ranger 2020",
    category: "Bumper",
    listPrice: 2500,
    discount: 15,
    leadTime: "5 days",
  });
  ws.addRow({
    partNumber: "HL-X5-18",
    name: "Headlight (LH) — BMW X5 2018",
    category: "Light",
    listPrice: 6800,
    discount: 10,
    leadTime: "7-10 days",
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition":
        'attachment; filename="price-my-prang-parts-template.xlsx"',
    },
  });
}
