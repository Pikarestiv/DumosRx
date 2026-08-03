/** A recent-activity feed row — the shared shape after tagging heterogeneous
 * rows (sales, stock movements, purchase orders, expenses, prescriptions)
 * with `activity_type` and merging them into one sorted feed. Every field
 * beyond `id`/`activity_type` only applies to some activity types. */
export interface DashboardActivity {
  id: string;
  activity_type: "sale" | "stock_movement" | "purchase_order" | "expense" | "prescription";
  created_at?: string;
  date?: string;
  transaction_date?: string;
  // sale
  prescription_id?: string;
  transaction_number?: string;
  total_amount?: number;
  total?: number;
  // stock_movement
  movement_type?: string;
  quantity?: number;
  total_cost?: number;
  // prescription
  patient_name?: string;
  // expense
  category?: string;
  amount?: number;
  // purchase_order
  po_number?: string;
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
