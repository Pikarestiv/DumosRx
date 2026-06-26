import { useMemo } from "react";
import { useLocalData } from "@/lib/db/hooks/useLocalData";

export function useInventoryAlerts() {
  const { data: lowStockAlerts } = useLocalData<{
    medicine: string;
    quantity: number;
    threshold: number;
  }>(
    `SELECT
      m.name as medicine,
      SUM(inv.quantity) as quantity,
      m.reorder_level as threshold
     FROM inventories inv
     JOIN medicines m ON inv.medicine_id = m.id
     WHERE inv._deleted = 0 AND m._deleted = 0
     GROUP BY m.id
     HAVING quantity <= m.reorder_level AND m.reorder_level > 0
     ORDER BY quantity ASC
     LIMIT 5`
  );

  const { data: expiryAlerts } = useLocalData<{
    medicine: string;
    expiryDate: string;
    daysLeft: number;
  }>(
    `SELECT
      m.name as medicine,
      inv.expiry_date as expiryDate,
      CAST((julianday(inv.expiry_date) - julianday('now')) AS INTEGER) as daysLeft
     FROM inventories inv
     JOIN medicines m ON inv.medicine_id = m.id
     WHERE inv._deleted = 0 AND m._deleted = 0
       AND inv.expiry_date IS NOT NULL
       AND inv.expiry_date != ''
       AND julianday(inv.expiry_date) <= julianday('now', '+30 days')
       AND julianday(inv.expiry_date) >= julianday('now')
     ORDER BY inv.expiry_date ASC
     LIMIT 5`
  );

  const inventoryAlerts = useMemo(() => {
    const low = (lowStockAlerts || []).map((a) => ({
      medicine: a.medicine,
      issue: "Low Stock",
      quantity: a.quantity,
      threshold: a.threshold,
      severity: a.quantity === 0 ? "critical" : a.quantity <= a.threshold / 2 ? "high" : "medium",
    }));
    const expiring = (expiryAlerts || []).map((a) => ({
      medicine: a.medicine,
      issue: "Expiring Soon",
      expiryDate: a.expiryDate,
      daysLeft: a.daysLeft,
      severity: a.daysLeft <= 7 ? "critical" : a.daysLeft <= 14 ? "high" : "medium",
    }));
    return [...expiring, ...low];
  }, [lowStockAlerts, expiryAlerts]);

  return inventoryAlerts;
}
