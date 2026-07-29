import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getLowStockAlerts, getExpiryAlerts } from "@/lib/db/queries/inventory";
import { queryKeys } from "@/lib/query-keys";

export function useStockBatchAlerts() {
  const { data: lowStockAlerts } = useQuery({
    ...queryKeys.stockBatches.lowStockAlerts(),
    queryFn: () => getLowStockAlerts(),
  });

  const { data: expiryAlerts } = useQuery({
    ...queryKeys.stockBatches.expiryAlerts(),
    queryFn: () => getExpiryAlerts(),
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
    return [...expiring, ...low];
  }, [lowStockAlerts, expiryAlerts]);

  return stock_batchAlerts;
}
