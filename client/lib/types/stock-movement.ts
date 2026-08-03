/** Row shape returned by getStockMovements()/getStockAdjustments() — the raw
 * `stock_movements` table joined with the product's name. */
export interface StockMovementDbRow {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  reason?: string;
  reference_id?: string;
  performed_by?: string;
  movement_date?: string;
  created_at?: string;
  product_name?: string;
}

/** Row shape returned by getProductHistory()'s stockMovements query — a
 * stock_movements row joined with the performing user's display name. */
export interface StockMovementHistoryRow extends StockMovementDbRow {
  performed_by_name?: string;
}
