/** Row shape for the `stock_batches` table. */
export interface StockBatch {
  id: string;
  product_id: string;
  batch_number?: string;
  expiry_date?: string;
  quantity: number;
  cost_price?: number;
  supplier_id?: string;
  manufacture_date?: string;
  location?: string;
  is_active?: number;
  created_at?: string;
}

/** Row shape returned by getAvailableStockBatches() — active stock_batches
 * joined with their product's name/strength/selling price, for pickers that
 * need to prescribe/sell against available batches. */
export interface AvailableStockBatch extends StockBatch {
  product_name?: string;
  m_strength?: string;
  strength?: string;
  selling_price?: number;
}
