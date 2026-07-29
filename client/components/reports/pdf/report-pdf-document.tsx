import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },
  storeName: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 2,
  },
  title: {
    fontSize: 12,
    fontWeight: 700,
    marginTop: 12,
  },
  subtitle: {
    fontSize: 9,
    color: "#666",
    marginTop: 2,
    marginBottom: 14,
  },
  table: {
    borderWidth: 1,
    borderColor: "#d0d0d0",
  },
  row: {
    flexDirection: "row",
  },
  headerRow: {
    backgroundColor: "#f3f4f6",
    borderBottomWidth: 1,
    borderColor: "#d0d0d0",
  },
  dataRow: {
    borderBottomWidth: 1,
    borderColor: "#e5e5e5",
  },
  cell: {
    padding: 6,
    flex: 1,
    borderRightWidth: 1,
    borderColor: "#e5e5e5",
  },
  headerCell: {
    fontWeight: 700,
    fontSize: 8,
    textTransform: "uppercase",
    color: "#444",
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    fontSize: 8,
    color: "#999",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

interface ReportPdfDocumentProps {
  storeName: string;
  title: string;
  subtitle?: string;
  headers: string[];
  rows: Record<string, any>[];
  generatedAt: string;
}

export function ReportPdfDocument({
  storeName,
  title,
  subtitle,
  headers,
  rows,
  generatedAt,
}: ReportPdfDocumentProps) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.storeName}>{storeName}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {subtitle ? `${subtitle} — ` : ""}Generated {generatedAt}
        </Text>

        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]}>
            {headers.map((h, i) => (
              <View
                key={h}
                style={[
                  styles.cell,
                  i === headers.length - 1 ? { borderRightWidth: 0 } : {},
                ]}
              >
                <Text style={styles.headerCell}>{h}</Text>
              </View>
            ))}
          </View>

          {rows.length === 0 && (
            <View style={styles.row}>
              <View style={[styles.cell, { borderRightWidth: 0 }]}>
                <Text>No data for this period.</Text>
              </View>
            </View>
          )}

          {rows.map((row, rowIdx) => (
            <View
              style={[styles.row, styles.dataRow]}
              key={rowIdx}
              wrap={false}
            >
              {headers.map((h, i) => (
                <View
                  key={h}
                  style={[
                    styles.cell,
                    i === headers.length - 1 ? { borderRightWidth: 0 } : {},
                  ]}
                >
                  <Text>{String(row[h] ?? "")}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
