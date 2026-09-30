import { escapeCsvCell } from "@/lib/utils";

export interface GlobalProductMetricsRow {
  totalSkus: number;
  mostStockedCategoryName: string;
  mostStockedCategoryGrowth: string;
  stockAlertRate: string;
  stockAlertCount: number;
  complianceRate: string;
  complianceStatus: string;
}

export function buildGlobalProductMetricsCsv(
  metrics: GlobalProductMetricsRow,
): string {
  const rows: [string, string | number][] = [
    ["Global Catalog Total (SKUs)", metrics.totalSkus],
    ["Most Stocked Category", metrics.mostStockedCategoryName],
    ["Most Stocked Category Growth", metrics.mostStockedCategoryGrowth],
    ["Stock Flag Rate", metrics.stockAlertRate],
    ["Stock Flag Critical Alerts", metrics.stockAlertCount],
    ["PCN Compliance Rate", metrics.complianceRate],
    ["PCN Compliance Status", metrics.complianceStatus],
  ];

  return [["Metric", "Value"], ...rows]
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
    .join("\n");
}

export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
