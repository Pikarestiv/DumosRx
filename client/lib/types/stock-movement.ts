// Row shape returned by getStockMovements()/getStockAdjustments():
// Rationale: docs/CLIENT_LIB_COMMENTS.md#types-stock-movement-ts-L1
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
  reference_type?: string;
  performed_by?: string;
  movement_date?: string;
  created_at?: string;
  product_name?: string;
  performed_by_name?: string;
  batch_number?: string;
  supplier_name?: string;
  status?: string | null;
}

/** Row shape returned by getProductHistory()'s stockMovements query: a
 * stock_movements row joined with the performing user's display name. */
export type StockMovementHistoryRow = StockMovementDbRow;
