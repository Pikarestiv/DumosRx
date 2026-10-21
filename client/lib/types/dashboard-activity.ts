// A recent-activity feed row:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#types-dashboard-activity-ts-L1
export interface DashboardActivity {
  id: string;
  activity_type: "sale" | "stock_movement" | "purchase_order" | "expense" | "prescription" | "return" | "product";
  created_at?: string;
  date?: string;
  transaction_date?: string;
  // sale
  prescription_id?: string | null;
  transaction_number?: string;
  total_amount?: number;
  total?: number;
  is_reseller_sale?: number;
  markup_type?: "reseller" | "store" | null;
  price_markup_total?: number;
  price_cut_total?: number;
  // stock_movement
  movement_type?: string;
  reference_type?: string | null;
  reason?: string | null;
  quantity?: number;
  total_cost?: number;
  // prescription
  patient_name?: string;
  // expense
  category?: string;
  amount?: number;
  // purchase_order
  po_number?: string;
  // return
  total_refunded?: number;
  // product
  name?: string;
  selling_price?: number;
  // Actor display name joined in per activity type; differs by source table.
  cashier_name?: string;
  performed_by_name?: string;
  ordered_by_name?: string;
  recorded_by_name?: string;
  created_by_name?: string;
}

/** The transformed, display-ready shape of a DashboardActivity row, plus the
 * raw row it came from (for opening the right details dialog on click). */
export interface ActivityFeedItem {
  id: string;
  type: DashboardActivity["activity_type"] | "prescription_sale";
  displayType: string;
  message: string;
  timestamp: string;
  amount: string;
  rawSale?: DashboardActivity;
  rawActivity: DashboardActivity;
}
