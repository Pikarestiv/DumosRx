import type { ActivityLog } from "./activity";

export interface DashboardStore {
  id: string;
  name: string;
}

export interface DashboardUser {
  name?: string;
  first_name?: string;
  email: string;
  store_name?: string;
  require_email_verification?: boolean;
  email_verified_at?: string | null;
}

export interface DashboardStats {
  total_sales?: { value?: number; growth?: string };
  stores_count?: number;
  last_sync?: string;
  stock_batch_value?: { value?: number };
  customers?: { value?: number; growth?: string };
  cloud_storage?: { used_gb?: number; limit_gb?: number; percentage?: number };
}

export interface FleetStore {
  id: string;
  name: string;
  status?: "online" | string;
  location?: string;
  address?: string;
  phone?: string;
  store_type?: string;
  staff_count?: number;
  low_stock_alerts?: number;
  expiring_items?: number;
  sales?: string | number;
  lastSync?: string;
}

export interface TransactionItem {
  id: string;
  quantity: number;
  unit_price?: number;
  total_price?: number;
  product_name?: string;
}

export interface Transaction {
  id: string;
  transaction_number?: string;
  total_amount?: number;
  created_at: string;
  cashier_name?: string;
  items?: TransactionItem[];
}

export interface StockBatchItem {
  id: string;
  quantity: number;
  reorder_level?: number;
  selling_price?: number;
  expiry_date?: string;
  product?: { name?: string; category?: { name?: string } };
}

export interface StoreDetail extends FleetStore {
  total_stock_batch?: number;
  daily_sales?: string | number;
  expiry_warning_days?: number;
  recent_transactions?: Transaction[];
  recent_activities?: ActivityLog[];
}

export interface AppliedCoupon {
  code: string;
  type: string;
  value: number;
  target_plan: string | null;
  target_interval: string | null;
}

export interface DowngradePlan {
  id: string;
  amount: number;
  name: string;
}

export interface SubscriptionStatus {
  status: "active" | "inactive" | string;
  plan?: string;
  days_remaining?: number;
  is_trial?: boolean;
  expires_at?: string;
  limits?: { sync_interval?: number; staff?: number };
  features?: { auto_backup?: boolean };
}

export interface BillingTransaction {
  id: string;
  date: string;
  desc: string;
  amount: string | number;
  status: "Success" | "Pending" | "Failed" | string;
  receipt_url?: string;
}

export interface ReleaseLinks {
  windows: string;
  macos: string;
  linux: string;
  android: string;
  version: string;
  winSize: string;
  macSize: string;
  linuxSize: string;
  androidSize: string;
}

export interface AppNotification {
  id: string;
  title: string;
  description?: string;
  time?: string;
  type?: "success" | "warning" | "error" | "info" | string;
  category: string;
  isRead?: boolean;
}

export interface UserSession {
  id: string;
  user_agent?: string;
  ip_address?: string;
  is_current?: boolean;
  last_used_at?: string;
  created_at?: string;
}

export interface StaffMember {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  username?: string;
  role: string;
  store_id?: string;
  store?: { name: string };
  store_name?: string;
  pin?: string;
  is_active?: boolean;
  status?: string;
}
