import { useMemo } from "react";
import { useLocalData } from "@/lib/db/hooks/useLocalData";

export function useStockBatchAlerts() {
  const { data: lowStockAlerts } = useLocalData<{
    product: string;
    quantity: number;
    threshold: number;
  }>(
    `SELECT
      m.name as product,
      SUM(inv.quantity) as quantity,
      m.reorder_level as threshold
     FROM stock_batches inv
     JOIN products m ON inv.product_id = m.id
     WHERE (inv._deleted = 0 OR inv._deleted IS NULL) AND (m._deleted = 0 OR m._deleted IS NULL)
     GROUP BY m.id
     HAVING quantity <= m.reorder_level AND m.reorder_level > 0
     ORDER BY quantity ASC
     LIMIT 5`
  );

  const { data: expiryAlerts } = useLocalData<{
    product: string;
    expiryDate: string;
    daysLeft: number;
  }>(
    `SELECT
      m.name as product,
      inv.expiry_date as expiryDate,
      CAST((julianday(inv.expiry_date) - julianday('now')) AS INTEGER) as daysLeft
     FROM stock_batches inv
     JOIN products m ON inv.product_id = m.id
     WHERE (inv._deleted = 0 OR inv._deleted IS NULL) AND (m._deleted = 0 OR m._deleted IS NULL)
       AND inv.expiry_date IS NOT NULL
       AND inv.expiry_date != ''
       AND julianday(inv.expiry_date) <= julianday('now', '+30 days')
       AND julianday(inv.expiry_date) >= julianday('now')
     ORDER BY inv.expiry_date ASC
     LIMIT 5`
  );

  const stock_batchAlerts = useMemo(() => {
    const low = (lowStockAlerts || []).map((a) => ({
      product: a.product,
      issue: "Low Stock",
      quantity: a.quantity,
      threshold: a.threshold,
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
