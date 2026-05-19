/**
 * useInventoryStats
 *
 * Single source of truth for all inventory stat cards across the app.
 * All components showing "Total Medicines", "Active Medicines", "Low Stock",
 * "Expiring Soon", etc., should pull from this hook to stay consistent.
 *
 * Data source: `medicines` table (primary stock ledger).
 * The `inventory` table is used for batch/location tracking only.
 */

"use client";

import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { useStore } from "@/lib/context/store-context";

export interface InventoryStats {
  totalMedicines: number;
  activeMedicines: number;
  lowStockCount: number;
  criticalStockCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  totalInventoryValue: number;
  loading: boolean;
}

export function useInventoryStats(): InventoryStats {
  const { storeProfile } = useStore();
  const expiryDays = storeProfile?.expiry_warning_days || 30;

  const { data: statsData, loading } = useLocalData<any>(
    `SELECT
      COUNT(*)                                                              AS total_medicines,
      COUNT(CASE WHEN (expiry_date IS NULL OR date(expiry_date) > date('now')) THEN 1 END) AS active_medicines,
      COUNT(CASE WHEN stock_quantity <= reorder_level
                  AND stock_quantity > 0                          THEN 1 END) AS low_stock_count,
      COUNT(CASE WHEN stock_quantity = 0                         THEN 1 END) AS critical_stock_count,
      COUNT(CASE WHEN expiry_date IS NOT NULL
                  AND date(expiry_date) > date('now')
                  AND date(expiry_date) <= date('now', '+' || ? || ' days') THEN 1 END) AS expiring_soon_count,
      COUNT(CASE WHEN expiry_date IS NOT NULL
                  AND date(expiry_date) <= date('now')            THEN 1 END) AS expired_count,
      COALESCE(SUM(stock_quantity * cost_price), 0)                         AS total_inventory_value
    FROM medicines
    WHERE _deleted = 0`,
    [expiryDays]
  );

  const row = statsData?.[0];

  return {
    totalMedicines: row?.total_medicines ?? 0,
    activeMedicines: row?.active_medicines ?? 0,
    lowStockCount: row?.low_stock_count ?? 0,
    criticalStockCount: row?.critical_stock_count ?? 0,
    expiringSoonCount: row?.expiring_soon_count ?? 0,
    expiredCount: row?.expired_count ?? 0,
    totalInventoryValue: row?.total_inventory_value ?? 0,
    loading,
  };
}
