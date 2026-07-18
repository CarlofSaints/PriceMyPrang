import { readFile } from "fs/promises";
import path from "path";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { BuiltQuote, PanelBeater, QuoteRequest } from "./types";
import { readMediaBytes } from "./blob";

const TEAL = "#00848D";
const INK = "#052F35";
const MUTE = "#6b7f82";
const LINE = "#e3edee";

// Column widths (percent of the table). Grouped: Parts | Panel | Paint | Strip.
const W = {
  code: "6%",
  desc: "23%",
  qty: "4%",
  parts: "10%",
  cCode: "5%",
  cAmt: "9%",
  cHrs: "5%",
} as const;
// Grouped-header spans (must equal the sum of their sub-columns).
const PARTS_SPAN = "43%"; // code + desc + qty + parts
const CAT_SPAN = "19%"; // cCode + cAmt + cHrs

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8, color: INK, fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brandLogo: { height: 30 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", color: INK },
  bar: { height: 3, backgroundColor: TEAL, marginVertical: 10 },

  boxes: { flexDirection: "row", gap: 8, marginBottom: 10 },
  box: { flex: 1, border: `1px solid ${LINE}`, borderRadius: 6, padding: 8 },
  label: { fontSize: 7, color: MUTE, textTransform: "uppercase", marginBottom: 2 },
  strong: { fontFamily: "Helvetica-Bold" },
  quoteNo: { fontSize: 13, fontFamily: "Helvetica-Bold", color: TEAL },
  pbLogo: { height: 22, marginBottom: 4 },
  line: { marginBottom: 1 },

  groupHead: { flexDirection: "row", marginTop: 4 },
  groupCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#fff",
    backgroundColor: TEAL,
    textAlign: "center",
    paddingVertical: 3,
    borderRight: "1px solid #fff",
  },
  subHead: { flexDirection: "row", backgroundColor: "#eef6f6", paddingVertical: 3 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 7, color: INK, paddingHorizontal: 3 },
  row: { flexDirection: "row", paddingVertical: 3, borderBottom: `1px solid ${LINE}` },
  cell: { fontSize: 7.5, paddingHorizontal: 3 },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
  note: { fontStyle: "italic", color: MUTE },

  totals: { marginTop: 10, alignSelf: "flex-end", width: "38%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    marginTop: 3,
    borderTop: `2px solid ${TEAL}`,
  },
  grandText: { fontFamily: "Helvetica-Bold", fontSize: 12, color: TEAL },

  footer: {
    position: "absolute",
    bottom: 18,
    left: 28,
    right: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  footNote: { fontSize: 7, color: "#9aa8aa", width: "72%" },
  footLogo: { height: 24 },
});

function zar(n: number) {
  return "R " + (n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// Money in a cell — dash when zero, to match an estimate sheet.
const money = (n: number) => (n ? zar(n) : "–");
const hrs = (n: number) => (n ? String(n) : "");

async function localImageDataUri(rel: string): Promise<string | null> {
  try {
    const buf = await readFile(path.join(process.cwd(), "public", rel));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function remoteImageDataUri(url?: string): Promise<string | null> {
  if (!url) return null;
  const media = await readMediaBytes(url);
  if (!media) return null;
  return `data:${media.contentType || "image/png"};base64,${media.buffer.toString("base64")}`;
}

export async function buildQuotePdf(
  quote: BuiltQuote,
  req: QuoteRequest,
  pb: PanelBeater
): Promise<Buffer> {
  const brandLogo = await localImageDataUri("brand/png/lockup-horizontal-dark.png");
  const brandIcon = await localImageDataUri("brand/png/icon-fullcolour.png");
  const pbLogo = await remoteImageDataUri(pb.logoUrl);

  const vehicle = [req.vehicle.make, req.vehicle.model, req.vehicle.series, req.vehicle.year]
    .filter(Boolean)
    .join(" ");

  const doc = (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Brand header */}
        <View style={styles.headerRow}>
          {brandLogo ? (
            <Image src={brandLogo} style={styles.brandLogo} />
          ) : (
            <Text style={styles.title}>Price my Prang</Text>
          )}
          <View>
            <Text style={styles.title}>QUOTATION</Text>
            <Text style={{ fontSize: 8, color: MUTE, textAlign: "right" }}>
              {new Date(quote.createdAt).toLocaleDateString("en-ZA")}
            </Text>
          </View>
        </View>
        <View style={styles.bar} />

        {/* Three info boxes: client | quote+PMP+estimator | repairer */}
        <View style={styles.boxes}>
          <View style={styles.box}>
            <Text style={styles.label}>Client</Text>
            <Text style={styles.strong}>
              {req.firstName} {req.lastName}
            </Text>
            {req.companyName ? <Text style={styles.line}>{req.companyName}</Text> : null}
            {req.phone ? <Text style={styles.line}>{req.phone}</Text> : null}
            {req.email ? <Text style={styles.line}>{req.email}</Text> : null}
            {vehicle ? <Text style={[styles.line, { marginTop: 3 }]}>{vehicle}</Text> : null}
            {req.vehicle.registration ? (
              <Text style={styles.line}>Reg: {req.vehicle.registration}</Text>
            ) : null}
          </View>

          <View style={styles.box}>
            <Text style={styles.label}>Quote number</Text>
            <Text style={styles.quoteNo}>{req.reference}</Text>
            <Text style={[styles.line, { marginTop: 4 }]}>
              A Price my Prang quotation · Crash · Quote · Claim
            </Text>
            <Text style={[styles.label, { marginTop: 6 }]}>Estimator</Text>
            <Text style={styles.strong}>{quote.estimatorName || quote.createdByName || "—"}</Text>
          </View>

          <View style={styles.box}>
            <Text style={styles.label}>Repairer</Text>
            {pbLogo ? <Image src={pbLogo} style={styles.pbLogo} /> : null}
            <Text style={styles.strong}>{pb.tradingAs || pb.companyName}</Text>
            {pb.tradingAs ? <Text style={styles.line}>{pb.companyName}</Text> : null}
            {pb.physicalAddress ? <Text style={styles.line}>{pb.physicalAddress}</Text> : null}
            <Text style={styles.line}>Reg: {pb.companyRegNumber}</Text>
            {pb.vatNumber ? <Text style={styles.line}>VAT: {pb.vatNumber}</Text> : null}
            <Text style={styles.line}>
              RMI {pb.rmiNumber}
              {pb.sambraNumber ? ` · SAMBRA ${pb.sambraNumber}` : ""}
            </Text>
            {pb.phone ? <Text style={styles.line}>{pb.phone}</Text> : null}
            {pb.email ? <Text style={styles.line}>{pb.email}</Text> : null}
          </View>
        </View>

        {/* Grouped table header */}
        <View style={styles.groupHead}>
          <Text style={[styles.groupCell, { width: PARTS_SPAN, backgroundColor: INK }]}>Parts</Text>
          <Text style={[styles.groupCell, { width: CAT_SPAN }]}>Panel Beating</Text>
          <Text style={[styles.groupCell, { width: CAT_SPAN }]}>Paint</Text>
          <Text style={[styles.groupCell, { width: CAT_SPAN, marginRight: 0 }]}>
            Strip &amp; Assemble
          </Text>
        </View>

        {/* Sub header */}
        <View style={styles.subHead}>
          <Text style={[styles.th, { width: W.code }]}>Code</Text>
          <Text style={[styles.th, { width: W.desc }]}>Description</Text>
          <Text style={[styles.th, { width: W.qty }, styles.center]}>Qty</Text>
          <Text style={[styles.th, { width: W.parts }, styles.right]}>Parts</Text>
          {["Panel", "Paint", "Strip"].map((g) => (
            <View key={g} style={{ flexDirection: "row", width: CAT_SPAN }}>
              <Text style={[styles.th, { width: W.cCode }]}>Code</Text>
              <Text style={[styles.th, { width: W.cAmt }, styles.right]}>Amount</Text>
              <Text style={[styles.th, { width: W.cHrs }, styles.right]}>Hrs</Text>
            </View>
          ))}
        </View>

        {/* Rows */}
        {quote.lines.map((l, i) => {
          const isNote = (l.code || "").toLowerCase() === "note";
          return (
            <View key={i} style={styles.row} wrap={false}>
              <Text style={[styles.cell, { width: W.code }]}>{l.code || ""}</Text>
              <Text style={[styles.cell, { width: W.desc }, isNote ? styles.note : {}]}>
                {l.description}
              </Text>
              <Text style={[styles.cell, { width: W.qty }, styles.center]}>{l.quantity || ""}</Text>
              <Text style={[styles.cell, { width: W.parts }, styles.right]}>{money(l.partsAmount)}</Text>

              <Text style={[styles.cell, { width: W.cCode }]}>{l.panelCode || ""}</Text>
              <Text style={[styles.cell, { width: W.cAmt }, styles.right]}>{money(l.panelAmount)}</Text>
              <Text style={[styles.cell, { width: W.cHrs }, styles.right]}>{hrs(l.panelHours)}</Text>

              <Text style={[styles.cell, { width: W.cCode }]}>{l.paintCode || ""}</Text>
              <Text style={[styles.cell, { width: W.cAmt }, styles.right]}>{money(l.paintAmount)}</Text>
              <Text style={[styles.cell, { width: W.cHrs }, styles.right]}>{hrs(l.paintHours)}</Text>

              <Text style={[styles.cell, { width: W.cCode }]}>{l.stripCode || ""}</Text>
              <Text style={[styles.cell, { width: W.cAmt }, styles.right]}>{money(l.stripAmount)}</Text>
              <Text style={[styles.cell, { width: W.cHrs }, styles.right]}>{hrs(l.stripHours)}</Text>
            </View>
          );
        })}

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>Parts</Text>
            <Text>{zar(quote.partsTotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>Labour (panel · paint · strip)</Text>
            <Text>{zar(quote.labourTotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>Sundries</Text>
            <Text>{zar(quote.sundries)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>Consumables</Text>
            <Text>{zar(quote.consumables)}</Text>
          </View>
          <View style={[styles.totalRow, { borderTop: `1px solid ${LINE}`, marginTop: 2, paddingTop: 3 }]}>
            <Text style={styles.strong}>Total ex VAT</Text>
            <Text style={styles.strong}>{zar(quote.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>VAT (15%)</Text>
            <Text>{zar(quote.vat)}</Text>
          </View>
          <View style={styles.grand}>
            <Text style={styles.grandText}>TOTAL INCL VAT</Text>
            <Text style={styles.grandText}>{zar(quote.total)}</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footNote}>
            This quotation is an estimate prepared via Price my Prang and is valid for 30 days.
            E&amp;OE. Prices include VAT where indicated.
          </Text>
          {brandIcon ? <Image src={brandIcon} style={styles.footLogo} /> : null}
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
