import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import type { VerdokData } from "@rechnungsai/gobd";

// All text uses the embedded NotoSans family (registerFonts must run at
// module level before renderToBuffer — see lib/pdf/fonts.ts / route).
const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSans",
    fontSize: 10,
    lineHeight: 1.5,
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    color: "#1a1a1a",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: "#555",
    marginBottom: 24,
  },
  section: {
    marginBottom: 16,
  },
  heading: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 6,
  },
  paragraph: {
    marginBottom: 4,
  },
  smoke: {
    marginTop: 24,
    fontSize: 9,
    color: "#888",
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    fontSize: 8,
    color: "#999",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export function VerdokTemplate({ data }: { data: VerdokData }) {
  const generatedDate = data.generatedAtIso.slice(0, 10);
  return (
    <Document title="Verfahrensdokumentation" author={data.tenantName}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Verfahrensdokumentation</Text>
        <Text style={styles.subtitle}>
          {data.company.name} — erstellt am {generatedDate}
        </Text>

        {data.sections.map((section) => (
          <View key={section.heading} style={styles.section} wrap={false}>
            <Text style={styles.heading}>{section.heading}</Text>
            {section.body.map((para, i) => (
              <Text key={i} style={styles.paragraph}>
                {para}
              </Text>
            ))}
          </View>
        ))}

        {/* Font-embedding smoke line (AC3) — must render real glyphs. */}
        <Text style={styles.smoke}>{data.umlautSmoke}</Text>

        <View style={styles.footer} fixed>
          <Text>
            {data.company.name} · GoBD-Verfahrensdokumentation
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Seite ${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
