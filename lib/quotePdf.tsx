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

const TEAL = "#00848D";
const CORAL = "#F05940";
const INK = "#052F35";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: INK, fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brandLogo: { height: 34 },
  quoteTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", color: INK },
  quoteMeta: { fontSize: 9, color: "#6b7f82", textAlign: "right" },
  bar: { height: 3, backgroundColor: TEAL, marginVertical: 14 },
  cols: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  colBox: { width: "48%" },
  label: { fontSize: 8, color: "#6b7f82", textTransform: "uppercase", marginBottom: 3 },
  strong: { fontFamily: "Helvetica-Bold" },
  pbLogo: { height: 26, marginBottom: 6 },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#eef6f6",
    paddingVertical: 6,
    paddingHorizontal: 6,
    marginTop: 6,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottom: "1px solid #eee",
  },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8, color: INK },
  cDesc: { width: "44%" },
  cNum: { width: "18%" },
  cQty: { width: "12%", textAlign: "right" },
  cPrice: { width: "13%", textAlign: "right" },
  cLine: { width: "13%", textAlign: "right" },
  totals: { marginTop: 12, alignSelf: "flex-end", width: "45%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grand: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    marginTop: 4,
    borderTop: `2px solid ${TEAL}`,
  },
  grandText: { fontFamily: "Helvetica-Bold", fontSize: 13, color: TEAL },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  footNote: { fontSize: 8, color: "#9aa8aa", width: "70%" },
  footLogo: { height: 30 },
});

function zar(n: number) {
  return "R " + (n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") || "image/png";
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function buildQuotePdf(
  quote: BuiltQuote,
  req: QuoteRequest,
  pb: PanelBeater
): Promise<Buffer> {
  const brandLogo = await localImageDataUri("brand/png/lockup-horizontal-dark.png");
  const brandIcon = await localImageDataUri("brand/png/icon-fullcolour.png");
  const pbLogo = await remoteImageDataUri(pb.logoUrl);

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          {brandLogo ? <Image src={brandLogo} style={styles.brandLogo} /> : <Text style={styles.quoteTitle}>Price my Prang</Text>}
          <View>
            <Text style={styles.quoteTitle}>QUOTATION</Text>
            <Text style={styles.quoteMeta}>Ref: {req.reference}</Text>
            <Text style={styles.quoteMeta}>Date: {new Date(quote.createdAt).toLocaleDateString("en-ZA")}</Text>
          </View>
        </View>

        <View style={styles.bar} />

        <View style={styles.cols}>
          <View style={styles.colBox}>
            <Text style={styles.label}>Prepared by</Text>
            {pbLogo && <Image src={pbLogo} style={styles.pbLogo} />}
            <Text style={styles.strong}>{pb.tradingAs || pb.companyName}</Text>
            {pb.tradingAs ? <Text>{pb.companyName}</Text> : null}
            <Text>{pb.physicalAddress}</Text>
            <Text>Reg: {pb.companyRegNumber}</Text>
            {pb.vatNumber ? <Text>VAT: {pb.vatNumber}</Text> : null}
            <Text>RMI {pb.rmiNumber} · SAMBRA {pb.sambraNumber}</Text>
            {pb.email ? <Text>{pb.email}</Text> : null}
            {pb.phone ? <Text>{pb.phone}</Text> : null}
          </View>
          <View style={styles.colBox}>
            <Text style={styles.label}>Prepared for</Text>
            <Text style={styles.strong}>{req.firstName} {req.lastName}</Text>
            <Text>{req.email}</Text>
            <Text style={{ marginTop: 6 }}>
              {[req.vehicle.make, req.vehicle.model, req.vehicle.series].filter(Boolean).join(" ")}
            </Text>
            <Text>
              {[req.vehicle.year, req.vehicle.colour].filter(Boolean).join(" · ")}
            </Text>
            {req.vehicle.registration ? <Text>Reg: {req.vehicle.registration}</Text> : null}
            {req.vehicle.vin ? <Text>VIN: {req.vehicle.vin}</Text> : null}
          </View>
        </View>

        {/* Parts */}
        <View style={styles.tableHead}>
          <Text style={[styles.th, styles.cDesc]}>Description</Text>
          <Text style={[styles.th, styles.cNum]}>Part no.</Text>
          <Text style={[styles.th, styles.cQty]}>Qty</Text>
          <Text style={[styles.th, styles.cPrice]}>Unit</Text>
          <Text style={[styles.th, styles.cLine]}>Line</Text>
        </View>
        {quote.parts.map((p, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={styles.cDesc}>{p.name}{p.supplier ? ` (${p.supplier})` : ""}</Text>
            <Text style={styles.cNum}>{p.partNumber || "—"}</Text>
            <Text style={styles.cQty}>{p.quantity}</Text>
            <Text style={styles.cPrice}>{zar(p.unitPrice)}</Text>
            <Text style={styles.cLine}>{zar(p.unitPrice * p.quantity)}</Text>
          </View>
        ))}

        {/* Labour */}
        <View style={styles.tableRow}>
          <Text style={styles.cDesc}>Labour — senior</Text>
          <Text style={styles.cNum}>—</Text>
          <Text style={styles.cQty}>{quote.seniorHours}h</Text>
          <Text style={styles.cPrice}>{zar(quote.labourRateSenior)}</Text>
          <Text style={styles.cLine}>{zar(quote.seniorHours * quote.labourRateSenior)}</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={styles.cDesc}>Labour — junior</Text>
          <Text style={styles.cNum}>—</Text>
          <Text style={styles.cQty}>{quote.juniorHours}h</Text>
          <Text style={styles.cPrice}>{zar(quote.labourRateJunior)}</Text>
          <Text style={styles.cLine}>{zar(quote.juniorHours * quote.labourRateJunior)}</Text>
        </View>

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>Parts</Text>
            <Text>{zar(quote.partsTotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>Labour</Text>
            <Text>{zar(quote.labourTotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>Subtotal</Text>
            <Text>{zar(quote.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>VAT (15%)</Text>
            <Text>{zar(quote.vat)}</Text>
          </View>
          <View style={styles.grand}>
            <Text style={styles.grandText}>TOTAL</Text>
            <Text style={styles.grandText}>{zar(quote.total)}</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footNote}>
            This quotation is an estimate prepared via Price my Prang and is valid for 30 days.
            E&amp;OE. All prices include VAT where indicated.
          </Text>
          {brandIcon ? <Image src={brandIcon} style={styles.footLogo} /> : null}
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
