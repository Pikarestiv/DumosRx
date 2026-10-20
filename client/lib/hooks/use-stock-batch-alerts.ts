import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getLowStockAlerts,
  getExpiryAlerts,
  getOversoldAlerts,
} from "@/lib/db/queries/inventory";
import { queryKeys } from "@/lib/query-keys";

// @param enabled - these three reads feed only the Analytics dashboard's Stock Batches tab, so its caller gates them on that tab being the act…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-stock-batch-alerts-ts-L10
export function useStockBatchAlerts(enabled = true) {
  const { data: lowStockAlerts } = useQuery({
    ...queryKeys.stockBatches.lowStockAlerts(),
    queryFn: () => getLowStockAlerts(),
    enabled,
  });

  const { data: expiryAlerts } = useQuery({
    ...queryKeys.stockBatches.expiryAlerts(),
    queryFn: () => getExpiryAlerts(),
    enabled,
  });

  const { data: oversoldAlerts } = useQuery({
    ...queryKeys.stockBatches.oversoldAlerts(),
    queryFn: () => getOversoldAlerts(),
    enabled,
  });

  const stock_batchAlerts = useMemo(() => {
    const low = (lowStockAlerts || []).map((a) => ({
      product: a.product,
      issue: "Low Stock",
      quantity: a.quantity,
      threshold: a.threshold,
      unit: a.baseUnit || "unit",
      severity: a.quantity === 0 ? "critical" : a.quantity <= a.threshold / 2 ? "high" : "medium",
    }));
    const expiring = (expiryAlerts || []).map((a) => ({
      product: a.product,
      issue: "Expiring Soon",
      expiryDate: a.expiryDate,
      daysLeft: a.daysLeft,
      severity: a.daysLeft <= 7 ? "critical" : a.daysLeft <= 14 ? "high" : "medium",
    }));
    // Always critical: it means the batch's recorded stock and its real stock have already diverged (a sale went through against more stock than t…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-stock-batch-alerts-ts-L47
    const oversold = (oversoldAlerts || []).map((a) => ({
      product: a.product,
      issue: "Oversold",
      quantity: a.quantity,
      severity: "critical",
    }));
    return [...oversold, ...expiring, ...low];
  }, [lowStockAlerts, expiryAlerts, oversoldAlerts]);

  return stock_batchAlerts;
}
