import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

const TEAL = "#00848D";
const INK = "#052F35";
const MUTE = "#6b7f82";
const LINE = "#e3edee";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, color: INK, fontFamily: "Helvetica", lineHeight: 1.5 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", color: INK },
  bar: { height: 3, backgroundColor: TEAL, marginVertical: 10 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 4 },
  p: { marginBottom: 5 },
  small: { fontSize: 8, color: MUTE },
  panel: { borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 12, marginTop: 14 },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: "35%", color: MUTE },
  value: { width: "65%", fontFamily: "Helvetica-Bold" },
  sigName: { fontSize: 14, fontFamily: "Helvetica-Oblique", marginTop: 2, marginBottom: 2 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 7,
    color: MUTE,
    textAlign: "center",
  },
});

/**
 * Strip the HTML we converted from the .docx back to plain paragraphs.
 *
 * react-pdf can't render HTML, and the agreement is prose rather than layout —
 * headings and paragraphs are all it needs to stay readable and complete.
 */
function htmlToParagraphs(html: string): { text: string; heading: boolean }[] {
  const blocks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/<\/(?:p|h[1-6]|li)>/i)
    .map((chunk) => {
      const heading = /<h[1-6][^>]*>/i.test(chunk);
      const text = chunk
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .trim();
      return { text, heading };
    })
    .filter((b) => b.text.length > 0);
  return blocks;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" });
}

/**
 * The countersigned record of a repairer accepting the agreement: the full
 * text they were shown, plus who signed it, when, and from where.
 */
export async function buildAgreementPdf(opts: {
  title: string;
  html: string;
  companyName: string;
  companyRegNumber?: string;
  vatNumber?: string;
  signerName: string;
  signerTitle?: string;
  signerEmail: string;
  signedAt: Date;
  signerIp?: string;
}): Promise<Buffer> {
  const blocks = htmlToParagraphs(opts.html);

  return renderToBuffer(
    <Document title={`${opts.title} — ${opts.companyName}`}>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.title}>{opts.title}</Text>
        <View style={styles.bar} />

        {blocks.map((b, i) => (
          <Text key={i} style={b.heading ? styles.h2 : styles.p}>
            {b.text}
          </Text>
        ))}

        <View style={styles.panel} wrap={false}>
          <Text style={styles.h2}>Signed by the Repairer</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Business name</Text>
            <Text style={styles.value}>{opts.companyName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Company registration number</Text>
            <Text style={styles.value}>{opts.companyRegNumber || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>VAT number</Text>
            <Text style={styles.value}>{opts.vatNumber || "—"}</Text>
          </View>

          <Text style={styles.sigName}>{opts.signerName}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Authorised signatory</Text>
            <Text style={styles.value}>{opts.signerName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Title</Text>
            <Text style={styles.value}>{opts.signerTitle || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{opts.signerEmail}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Date signed</Text>
            <Text style={styles.value}>{fmtDate(opts.signedAt)}</Text>
          </View>

          <Text style={styles.small}>
            Signed electronically on {opts.signedAt.toISOString()}
            {opts.signerIp ? ` from ${opts.signerIp}` : ""}. The signatory confirmed they had read
            and accepted this agreement, and that they were authorised to bind the business named
            above.
          </Text>
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Price my Prang (Pty) Ltd · ${opts.companyName} · page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
