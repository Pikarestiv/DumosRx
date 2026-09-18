export interface Sale {
  id: string;
  transaction_number: string;
  customer_id?: string | null;
  user_id?: string | null;
  prescription_id?: string | null;
  subtotal: number;
  tax_amount?: number;
  discount_total?: number;
  total_amount: number;
  amount_paid?: number;
  change_given?: number;
  payment_method?: string;
  payment_details?: string;
  payment_status?: string;
  transaction_date?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  points_earned?: number;
  points_redeemed?: number;
  is_reseller_sale?: number;
  reseller_commission_percentage?: number;
  reseller_commission_amount?: number;
  /** Full markup (selling price above the normal price, summed across line
   * items) before the store's commission percentage is applied. */
  reseller_markup_amount?: number;
  reseller_commission_redeemed?: number;
  /** The amount that actually left the store at settlement time: either
   * reseller_commission_amount (paid to the reseller), or 0 when the store
   * claimed the entire markup for itself (reseller_commission_claim_type ===
   * "store_claim") - snapshotted so profit reporting doesn't have to
   * re-derive it. */
  reseller_commission_redeemed_amount?: number;
  reseller_commission_claim_type?: "commission" | "store_claim" | null;
  reseller_commission_redeemed_at?: string;
  reseller_commission_redeemed_by?: string;
}

/** `Sale` joined with the customer/cashier/return aggregates that
 * getRecentSales() adds: the shape rendered in the transaction history list. */
export interface SaleWithDetails extends Sale {
  customer_name?: string;
  customer_phone?: string;
  cashier_name?: string;
  user_name?: string;
  cashier?: string;
  item_count?: number;
  total_refunded?: number;
  /** "||"-joined product names for this sale's line items, for searching by
   * item without a separate fetch - see getRecentSales(). */
  item_names?: string;
  // Legacy/alternate field names some older records or views may use in
  // place of the canonical column above.
  total?: number;
  change?: number;
  status?: string;
  tax?: number;
  discount?: number;
  discount_amount?: number;
  receipt_number?: string;
}

/** Row shape returned by getTransactionDetails(): a sale_items row joined
 * with the product name and cumulative returned quantity for that line. */
export interface SaleItemDetail {
  id: string;
  sale_id: string;
  product_id: string;
  stock_batch_id?: string;
  quantity: number;
  unit_price: number;
  cost_price?: number;
  med_cost_price?: number;
  total_price: number;
  product_name?: string;
  name?: string;
  subtotal?: number;
  returned_quantity?: number;
}

/** returns row joined with the originating sale's payment fields: used to
 * work out which payment bucket (cash/card/transfer) a refund reduces. */
export interface ReturnRecord {
  id: string;
  sale_id: string;
  user_id: string;
  reason?: string;
  total_refunded: number;
  created_at?: string;
  payment_method?: string;
  payment_details?: string;
  transaction_number?: string;
}

export interface ReturnItemDetail {
  id: string;
  return_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  cost_price?: number;
  med_cost_price?: number;
}
