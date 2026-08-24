import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  storeName: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  title: { fontSize: 13, fontWeight: 700, marginTop: 14 },
  subtitle: { fontSize: 10, color: "#666", marginTop: 2, marginBottom: 20 },
  metricsRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  metricBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 4,
    padding: 10,
  },
  metricLabel: {
    fontSize: 7,
    fontWeight: 700,
    textTransform: "uppercase",
    color: "#888",
    marginBottom: 4,
  },
  metricValue: { fontSize: 12, fontWeight: 700 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginTop: 10, marginBottom: 8 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderColor: "#eee",
  },
});

const money = (currency: string | undefined, n: number) =>
  `${currency || "NGN"} ${Math.round(n).toLocaleString()}`;

interface DailyClosePdfProps {
  storeName: string;
  reportDate: string;
  currencyCode?: string;
  aggregatedTotals: {
    cash: number;
    card: number;
    transfer: number;
    credit: number;
    total: number;
    refunds: number;
    cardAccounts: Record<string, { name: string; total: number }>;
    transferAccounts: Record<string, { name: string; total: number }>;
  };
  totalProfit: number;
  topSellingMeds: { name: string; quantity: number; revenue: number }[];
  generatedAt: string;
}

export function DailyClosePdf({
  storeName,
  reportDate,
  currencyCode,
  aggregatedTotals,
  totalProfit,
  topSellingMeds,
  generatedAt,
}: DailyClosePdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.storeName}>{storeName}</Text>
        <Text style={styles.title}>Daily Close Report</Text>
        <Text style={styles.subtitle}>
          {reportDate}, generated {generatedAt}
        </Text>

        <View style={styles.metricsRow}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Net Sales</Text>
            <Text style={styles.metricValue}>
              {money(currencyCode, aggregatedTotals.total)}
            </Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Net Profit (Est.)</Text>
            <Text style={styles.metricValue}>
              {money(currencyCode, totalProfit)}
            </Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Refunds</Text>
            <Text style={styles.metricValue}>
              {money(currencyCode, aggregatedTotals.refunds)}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Payment Breakdown</Text>
        <View style={styles.row}>
          <Text>Cash</Text>
          <Text>{money(currencyCode, aggregatedTotals.cash)}</Text>
        </View>
        <View style={styles.row}>
          <Text>Card / POS</Text>
          <Text>{money(currencyCode, aggregatedTotals.card)}</Text>
        </View>
        {Object.values(aggregatedTotals.cardAccounts).map((acc, i) => (
          <View style={styles.row} key={`card-${i}`}>
            <Text>  {acc.name}</Text>
            <Text>{money(currencyCode, acc.total)}</Text>
          </View>
        ))}
        <View style={styles.row}>
          <Text>Transfer / Mobile</Text>
          <Text>{money(currencyCode, aggregatedTotals.transfer)}</Text>
        </View>
        {Object.values(aggregatedTotals.transferAccounts).map((acc, i) => (
          <View style={styles.row} key={`transfer-${i}`}>
            <Text>  {acc.name}</Text>
            <Text>{money(currencyCode, acc.total)}</Text>
          </View>
        ))}
        <View style={styles.row}>
          <Text>Credit Sales</Text>
          <Text>{money(currencyCode, aggregatedTotals.credit)}</Text>
        </View>

        {topSellingMeds.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Highest Selling Products</Text>
            {topSellingMeds.map((med, i) => (
              <View style={styles.row} key={i}>
                <Text>
                  {med.name} × {med.quantity}
                </Text>
                <Text>{money(currencyCode, med.revenue)}</Text>
              </View>
            ))}
          </>
        )}
      </Page>
    </Document>
  );
}
