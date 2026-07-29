import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },
  storeName: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  title: { fontSize: 13, fontWeight: 700, marginTop: 14 },
  subtitle: { fontSize: 10, color: "#666", marginTop: 2, marginBottom: 20 },
  metricsRow: { flexDirection: "row", gap: 16, marginBottom: 20 },
  metricBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 4,
    padding: 12,
  },
  metricLabel: {
    fontSize: 8,
    fontWeight: 700,
    textTransform: "uppercase",
    color: "#888",
    marginBottom: 4,
  },
  metricValue: { fontSize: 14, fontWeight: 700 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginTop: 10,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: "#1a1a1a",
    marginTop: 4,
  },
});

interface PnlSummaryPdfProps {
  storeName: string;
  period: string;
  revenue: number;
  cogs: number;
  expenses: number;
  netProfit: number;
  expenseBreakdown: { category: string; amount: number }[];
  generatedAt: string;
}

const money = (n: number) => `NGN ${Math.round(n).toLocaleString()}`;

export function PnlSummaryPdf({
  storeName,
  period,
  revenue,
  cogs,
  expenses,
  netProfit,
  expenseBreakdown,
  generatedAt,
}: PnlSummaryPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.storeName}>{storeName}</Text>
        <Text style={styles.title}>Profit &amp; Loss Summary</Text>
        <Text style={styles.subtitle}>
          {period} — Generated {generatedAt}
        </Text>

        <View style={styles.metricsRow}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Revenue</Text>
            <Text style={styles.metricValue}>{money(revenue)}</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Net Profit</Text>
            <Text style={styles.metricValue}>{money(netProfit)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Breakdown</Text>
        <View style={styles.row}>
          <Text>Revenue</Text>
          <Text>{money(revenue)}</Text>
        </View>
        <View style={styles.row}>
          <Text>Cost of Goods Sold (COGS)</Text>
          <Text>-{money(cogs)}</Text>
        </View>
        <View style={styles.row}>
          <Text>Operating Expenses</Text>
          <Text>-{money(expenses)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={{ fontWeight: 700 }}>Net Profit</Text>
          <Text style={{ fontWeight: 700 }}>{money(netProfit)}</Text>
        </View>

        {expenseBreakdown.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Expenses by Category</Text>
            {expenseBreakdown.map((e, i) => (
              <View style={styles.row} key={i}>
                <Text>{e.category}</Text>
                <Text>{money(e.amount)}</Text>
              </View>
            ))}
          </>
        )}
      </Page>
    </Document>
  );
}
