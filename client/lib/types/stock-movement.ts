/** Row shape returned by getStockMovements()/getStockAdjustments() — the raw
 * `stock_movements` table joined with the product's name, the performing
 * user's display name, and (via stock_batch_id) the batch number and its
 * originating supplier's name. */
export interface StockMovementDbRow {
  id: string;
  product_id: string;
  stock_batch_id?: string;
  movement_type: string;
  quantity: number;
  unit_cost?: number;
  total_cost?: number;
  reason?: string;
  reference_id?: string;
  performed_by?: string;
  movement_date?: string;
  created_at?: string;
  product_name?: string;
  performed_by_name?: string;
  batch_number?: string;
  supplier_name?: string;
}

/** Row shape returned by getProductHistory()'s stockMovements query — a
 * stock_movements row joined with the performing user's display name. */
export type StockMovementHistoryRow = StockMovementDbRow;
