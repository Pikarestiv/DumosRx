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
