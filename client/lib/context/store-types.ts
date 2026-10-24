export type StoreType = "pharmacy" | "grocery" | "supermarket" | "retail";

export interface StoreProfile {
  id: string;
  name: string;
  store_type: StoreType;
  is_initialized: number;
  currency: string;
  vat_percentage: number;
  theme: string;
  location?: string;
  address?: string;
  phone?: string;
  email?: string;
  pcn_license?: string;
  registration_number?: string;
  tax_number?: string;
  reseller_commission_percentage?: number;
  custom_units?: string;
  receipt_header?: string;
  receipt_footer?: string;
  receipt_tagline?: string;
  show_logo_on_receipt?: number;
  receipt_logo_position?: "above" | "beside";
  show_contact_on_receipt?: number;
  show_phone_on_receipt?: number;
  show_address_on_receipt?: number;
  show_barcode_on_receipt?: number;
  hide_powered_by?: number;
  low_stock_warning?: number;
  expiry_warning?: number;
  expiry_warning_days?: number;
  logo_url?: string;
  auto_sync_enabled?: number;
  auto_sync_interval?: number;
  subscription_tier?: "free" | "local" | "pro" | "enterprise";
  status?: "Active" | "Suspended";
  suspension_reason?: string;
  show_retail_suggestions?: number;
  require_payment_account?: number;
  enabled_payment_methods?: string;
  online_store_enabled?: number;
  loyalty_program_enabled?: number;
  loyalty_points_per_currency?: number;
  uppercase_display_enabled?: number;
  store_slug?: string;
  // Server-set by the online-payment onboarding endpoint and pulled down by sync; read-only here (nothing in this app may write them, see client…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#context-store-context-tsx-L73
  paystack_subaccount_code?: string | null;
  paystack_bank_code?: string | null;
  paystack_account_number_last4?: string | null;
  // Server-set the last time store_slug actually changed (not on the first-ever set) - drives the Settings UI's "you can change this again on [d…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#context-store-context-tsx-L80
  store_slug_changed_at?: string | null;
  updated_at?: string;
  license_token?: string;
  last_monotonic_time?: string;
  device_id?: string;
  is_demo?: number;
  require_sale_notes?: number;
  display_stock_levels?: number;
  // Off by default: whether non-admin staff (specialist, sales_staff) can use the POS header's "Request stock from another store" button.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#context-store-context-tsx-L91
  staff_can_request_transfers?: number;
  // Off by default: gates the POS cart's "Reseller sale" row (both the reseller-commission and store-markup sub-types) - see isMarkupSalesEnable…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#context-store-context-tsx-L96
  markup_sales_enabled?: number;
}

export interface StoreContextType {
  storeProfile: StoreProfile | null;
  loading: boolean;
  storeType: StoreType;
  theme: string;
  isInitialized: boolean;
  vatPercentage: number;
  updateStoreProfile: (data: Partial<StoreProfile>) => Promise<void>;
  setTheme: (theme: string) => void;
  t: (key: string) => string;
  activeStoreId: string | null;
  availableStores: StoreProfile[];
  switchStore: (storeId: string) => void;
  // True for the duration of switchStore()'s async work (cancel + clear).
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#context-store-context-tsx-L115
  isSwitchingStore: boolean;
  refetch: () => Promise<unknown>;
}
