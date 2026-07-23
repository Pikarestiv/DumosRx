/**
 * useStockBatchStats
 *
 * Single source of truth for all inventory stat cards across the app.
 * All components showing "Total Products", "Active Products", "Low Stock",
 * "Expiring Soon", etc., should pull from this hook to stay consistent.
 *
 * Data source: `products` table (primary stock ledger).
 * The `stock_batch` table is used for batch/location tracking only.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/lib/context/store-context";
import { getStockBatchStats } from "@/lib/db/queries/inventory";

export interface StockBatchStats {
  totalProducts: number;
  activeProducts: number;
  lowStockCount: number;
  criticalStockCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  missingExpiryCount: number;
  totalStockBatchValue: number;
  activeCategories: number;
  loading: boolean;
}

export function useStockBatchStats(): StockBatchStats {
  const { storeProfile } = useStore();
  const expiryDays = storeProfile?.expiry_warning_days || 30;

  const { data: statsData, isLoading: loading } = useQuery({
    queryKey: ['stockBatchStats', expiryDays],
    queryFn: () => getStockBatchStats(expiryDays),
  });

  const row = statsData;

  return {
    totalProducts: row?.total_products ?? 0,
    activeProducts: row?.active_products ?? 0,
    lowStockCount: row?.low_stock_count ?? 0,
    criticalStockCount: row?.critical_stock_count ?? 0,
    expiringSoonCount: row?.expiring_soon_count ?? 0,
    expiredCount: row?.expired_count ?? 0,
    missingExpiryCount: row?.missing_expiry_count ?? 0,
    totalStockBatchValue: row?.total_stock_batch_value ?? 0,
    activeCategories: row?.active_categories ?? 0,
    loading,
  };
}
