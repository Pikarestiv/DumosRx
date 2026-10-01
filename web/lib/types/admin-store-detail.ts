import type { AdminBillingTransaction } from "./admin";

/** Payload of GET /admin/stores/{id}, the Store Details page's single-store
 * view. Kept out of admin.ts purely for that file's size budget. */
export interface AdminStoreDetailOwner {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  last_login_human: string;
  joined_at: string | null;
  deletion_requested: boolean;
}

export interface AdminStoreDetailSubscription {
  plan: string;
  status: string;
  is_trial: boolean;
  start_date: string | null;
  end_date: string | null;
  days_remaining: number | null;
}

export interface AdminStoreDetailActivity {
  id: number | string;
  action: string;
  description: string | null;
  status: string | null;
  actor: string | null;
  at: string | null;
}

export interface AdminStoreBusinessMetrics {
  revenue_raw: number;
  revenue?: string;
  order_count: number;
  average_order_value: string;
  average_order_value_raw: number;
  active_days: number;
  days_since_registration: number;
  first_sale_at: string | null;
  last_sale_at: string | null;
  window_days: number;
  revenue_last_window: string;
  orders_last_window: number;
  /** null when the previous window had no revenue at all, which makes a
   * percentage change meaningless rather than infinite. */
  revenue_growth_pct: number | null;
  order_growth_pct: number | null;
  monthly_trend: Array<{ label: string; revenue: string; revenue_raw: number; orders: number }>;
}

export interface AdminStoreOperationalMetrics {
  staff_count: number;
  device_id: string | null;
  device_count: number;
  active_sessions: number;
  inventory: { products: number; categories: number; suppliers: number; customers: number };
  stock_value_raw: number;
  stock_value: string;
  stock_activity: {
    movements: number;
    movements_last_window: number;
    audits: number;
    audits_last_window: number;
  };
  last_active_at: string | null;
  last_active_human: string;
  activity_last_window: number;
  sync_health: string;
}

export interface AdminStoreDetail {
  id: string;
  name: string;
  store_slug: string | null;
  store_type: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  currency: string;
  timezone: string;
  vat_percentage: number | string | null;
  pcn_license: string | null;
  registration_number: string | null;
  status: string;
  suspension_reason: string | null;
  is_demo: boolean;
  created_at: string | null;
  revenue?: string;
  owner: AdminStoreDetailOwner | null;
  subscription: AdminStoreDetailSubscription | null;
  account_manager: { id: string; name: string; email: string } | null;
  account_manager_is_explicit: boolean;
  sync: {
    device_id: string | null;
    auto_sync_enabled: boolean;
    auto_sync_interval: number | null;
    last_sync_at: string | null;
    last_sync_human: string;
  };
  storefront: {
    online_store_enabled: boolean;
    store_slug: string | null;
    pending_rebuild: boolean;
    dirty_since: string | null;
  };
  payments: {
    paystack_connected: boolean;
    subaccount_code: string | null;
    bank_code: string | null;
    account_number_last4: string | null;
    require_payment_account: boolean;
    enabled_payment_methods: unknown;
  };
  is_archived: boolean;
  archived_at: string | null;
  deletion_reason: string | null;
  counts: {
    staff: number;
    products: number;
    customers: number;
    sales: number;
    stock_value: string;
  };
  /** Omitted entirely for a non-super_admin caller: both blocks carry money
   * figures, which only super_admin may see. */
  business_metrics?: AdminStoreBusinessMetrics;
  operational_metrics: AdminStoreOperationalMetrics;
  recent_transactions?: AdminBillingTransaction[];
  recent_activity: AdminStoreDetailActivity[];
}
