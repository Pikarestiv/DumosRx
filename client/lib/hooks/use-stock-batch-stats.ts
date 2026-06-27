/**
 * useStockBatchStats
 *
 * Single source of truth for all stock_batch stat cards across the app.
 * All components showing "Total Products", "Active Products", "Low Stock",
 * "Expiring Soon", etc., should pull from this hook to stay consistent.
 *
 * Data source: `products` table (primary stock ledger).
 * The `stock_batch` table is used for batch/location tracking only.
 */

"use client";

import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { useStore } from "@/lib/context/store-context";

export interface StockBatchStats {
  totalProducts: number;
  activeProducts: number;
  lowStockCount: number;
  criticalStockCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  totalStockBatchValue: number;
  loading: boolean;
}

export function useStockBatchStats(): StockBatchStats {
  const { storeProfile } = useStore();
  const expiryDays = storeProfile?.expiry_warning_days || 30;

  const { data: statsData, loading } = useLocalData<any>(
    `SELECT
      COUNT(p.id) AS total_products,
      SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END) AS active_products,
      SUM(CASE WHEN COALESCE(sb.total_qty, 0) <= p.reorder_level AND COALESCE(sb.total_qty, 0) > 0 THEN 1 ELSE 0 END) AS low_stock_count,
      SUM(CASE WHEN COALESCE(sb.total_qty, 0) = 0 THEN 1 ELSE 0 END) AS critical_stock_count,
      SUM(CASE WHEN sb.expiring_soon > 0 THEN 1 ELSE 0 END) AS expiring_soon_count,
      SUM(CASE WHEN sb.expired > 0 THEN 1 ELSE 0 END) AS expired_count,
      COALESCE(SUM(sb.total_value), 0) AS total_stock_batch_value
    FROM products p
    LEFT JOIN (
      SELECT product_id,
        SUM(quantity) as total_qty,
        SUM(CASE WHEN expiry_date IS NOT NULL AND date(expiry_date) > date('now') AND date(expiry_date) <= date('now', '+' || ? || ' days') THEN 1 ELSE 0 END) as expiring_soon,
        SUM(CASE WHEN expiry_date IS NOT NULL AND date(expiry_date) <= date('now') THEN 1 ELSE 0 END) as expired,
        SUM(quantity * cost_price) as total_value
      FROM stock_batches
      WHERE _deleted = 0
      GROUP BY product_id
    ) sb ON p.id = sb.product_id
    WHERE p._deleted = 0`,
    [expiryDays]
  );

  const row = statsData?.[0];

  return {
    totalProducts: row?.total_products ?? 0,
    activeProducts: row?.active_products ?? 0,
    lowStockCount: row?.low_stock_count ?? 0,
    criticalStockCount: row?.critical_stock_count ?? 0,
    expiringSoonCount: row?.expiring_soon_count ?? 0,
    expiredCount: row?.expired_count ?? 0,
    totalStockBatchValue: row?.total_stock_batch_value ?? 0,
    loading,
  };
}
