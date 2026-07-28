import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  storeName: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  title: { fontSize: 13, fontWeight: 700, marginTop: 14 },
  subtitle: { fontSize: 10, color: "#666", marginTop: 2, marginBottom: 4 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, marginBottom: 16 },
  metaBlock: { flexDirection: "column" },
  metaLabel: { fontSize: 7, fontWeight: 700, textTransform: "uppercase", color: "#888", marginBottom: 2 },
  metaValue: { fontSize: 10, fontWeight: 700 },
  table: { borderWidth: 1, borderColor: "#d0d0d0", marginTop: 10 },
  row: { flexDirection: "row" },
  headerRow: { backgroundColor: "#f3f4f6", borderBottomWidth: 1, borderColor: "#d0d0d0" },
  dataRow: { borderBottomWidth: 1, borderColor: "#e5e5e5" },
  cellProduct: { padding: 6, flex: 3, borderRightWidth: 1, borderColor: "#e5e5e5" },
  cellQty: { padding: 6, flex: 1, borderRightWidth: 1, borderColor: "#e5e5e5", textAlign: "right" },
  cellUnitCost: { padding: 6, flex: 1, borderRightWidth: 1, borderColor: "#e5e5e5", textAlign: "right" },
  cellSubtotal: { padding: 6, flex: 1, textAlign: "right" },
  headerCell: { fontWeight: 700, fontSize: 8, textTransform: "uppercase", color: "#444" },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10, paddingRight: 6 },
  totalLabel: { fontWeight: 700, fontSize: 11, marginRight: 20 },
  totalValue: { fontWeight: 700, fontSize: 11 },
});

interface PurchaseOrderPdfProps {
  storeName: string;
  poNumber: string;
  vendorName: string;
  createdAt: string;
  status: string;
  notes?: string;
  items: { product_name: string; bulk_quantity: number; unit_cost: number; subtotal: number }[];
  totalAmount: number;
  generatedAt: string;
}

export function PurchaseOrderPdf({
  storeName,
  poNumber,
  vendorName,
  createdAt,
  status,
  notes,
  items,
  totalAmount,
  generatedAt,
}: PurchaseOrderPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.storeName}>{storeName}</Text>
        <Text style={styles.title}>Purchase Order {poNumber}</Text>
        <Text style={styles.subtitle}>Generated {generatedAt}</Text>

        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Vendor</Text>
            <Text style={styles.metaValue}>{vendorName}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Date</Text>
            <Text style={styles.metaValue}>{createdAt}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Status</Text>
            <Text style={styles.metaValue}>{status}</Text>
          </View>
        </View>

        {notes && (
          <Text style={{ marginBottom: 10, color: "#555" }}>{notes}</Text>
        )}

        <View style={styles.table}>
          <View style={[styles.row, styles.headerRow]}>
            <View style={styles.cellProduct}>
              <Text style={styles.headerCell}>Product</Text>
            </View>
            <View style={styles.cellQty}>
              <Text style={styles.headerCell}>Qty</Text>
            </View>
            <View style={styles.cellUnitCost}>
              <Text style={styles.headerCell}>Unit Cost</Text>
            </View>
            <View style={{ padding: 6, flex: 1, textAlign: "right" }}>
              <Text style={styles.headerCell}>Subtotal</Text>
            </View>
          </View>

          {items.map((item, i) => (
            <View style={[styles.row, styles.dataRow]} key={i} wrap={false}>
              <View style={styles.cellProduct}>
                <Text>{item.product_name}</Text>
              </View>
              <View style={styles.cellQty}>
                <Text>{item.bulk_quantity}</Text>
              </View>
              <View style={styles.cellUnitCost}>
                <Text>{item.unit_cost.toLocaleString()}</Text>
              </View>
              <View style={styles.cellSubtotal}>
                <Text>{item.subtotal.toLocaleString()}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{totalAmount.toLocaleString()}</Text>
        </View>
      </Page>
    </Document>
  );
}
