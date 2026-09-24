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
import { queryKeys } from "@/lib/query-keys";

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
  // 90, matching the schema default (`expiry_warning_days INTEGER DEFAULT
  // 90`) and every consumer that captions this figure - stock-batch-metrics
  // ("Within {expiry_warning_days || 90} days"), needs-attention, and
  // use-product-details all fall back to 90. Falling back to 30 here made
  // the "Expiring soon" card count a 30-day window while its own caption,
  // and the lists it cross-references, said 90.
  const expiryDays = storeProfile?.expiry_warning_days || 90;

  const { data: statsData, isLoading: loading } = useQuery({
    ...queryKeys.stockBatches.stats(expiryDays),
    queryFn: () => getStockBatchStats(expiryDays),
  });

  const row = statsData;

  return {
    totalProducts: row?.total_products ?? 0,
    activeProducts: row?.active_products ?? 0,
    // "Needs reordering": at or below reorder level, INCLUDING the ones that
    // have sold out entirely. getStockBatchStats's low_stock_count
    // deliberately excludes qty = 0 (that's critical_stock_count), so a
    // product that sold out vanished from the only count the owner sees on
    // the Low stock card / Action Center / sidebar badge - the most urgent
    // case disappearing from the reorder list. criticalStockCount stays
    // exposed separately for anything that needs the strict split.
    lowStockCount: (row?.low_stock_count ?? 0) + (row?.critical_stock_count ?? 0),
    criticalStockCount: row?.critical_stock_count ?? 0,
    expiringSoonCount: row?.expiring_soon_count ?? 0,
    expiredCount: row?.expired_count ?? 0,
    missingExpiryCount: row?.missing_expiry_count ?? 0,
    totalStockBatchValue: row?.total_stock_batch_value ?? 0,
    activeCategories: row?.active_categories ?? 0,
    loading,
  };
}
