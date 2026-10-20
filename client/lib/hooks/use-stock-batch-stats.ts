// useStockBatchStats
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-stock-batch-stats-L1

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
  // 90, matching the schema default (`expiry_warning_days INTEGER DEFAULT 90`) and every consumer that captions this figure - stock-batch-metric…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-stock-batch-stats-ts-L26
  const expiryDays = storeProfile?.expiry_warning_days || 90;

  const { data: statsData, isLoading: loading } = useQuery({
    ...queryKeys.stockBatches.stats(expiryDays),
    queryFn: () => getStockBatchStats(expiryDays),
  });

  const row = statsData;

  return {
    totalProducts: row?.total_products ?? 0,
    activeProducts: row?.active_products ?? 0,
    // "Needs reordering": at or below reorder level, INCLUDING the ones that have sold out entirely.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-stock-batch-stats-ts-L44
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
