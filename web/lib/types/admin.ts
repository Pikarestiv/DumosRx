export interface PaginationMeta {
  current_page: number;
  last_page: number;
  total: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta?: PaginationMeta;
}

export interface AdminStat {
  icon: string;
  color: string;
  name: string;
  trend?: "up" | "down";
  change?: string | number;
  value?: string | number;
  totals_by_currency?: Record<string, number>;
}

/** A row in the scoped "My Stores" list (GET /admin/stores/registered-by-me).
 * Deliberately narrower than AdminStoreSummary: no revenue, since
 * platform_admin/agent are not meant to see platform money figures. */
export interface RegisteredStoreSummary {
  id: string;
  name: string;
  owner: string;
  email: string;
  phone?: string | null;
  plan: string;
  plan_status: string;
  plan_ends_at?: string | null;
  status: string;
  date: string;
  is_demo?: boolean;
  device_id?: string | null;
  device_label?: string | null;
}

export interface AdminStoreSummary {
  id: string;
  name: string;
  owner: string;
  email?: string;
  plan: string;
  /** The store's real account-state column (Active/Suspended) — the same
   * meaning everywhere this type is used (Store Fleet list, View Store
   * Details, and the dashboard's Recent Stores widget). */
  status: string;
  /** Recent Stores only: a sync-recency signal ("Active"/"Away"/"Inactive"
   * based on how long since the device last synced), deliberately a
   * separate field from `status` so it's never mistaken for account state.
   * Drives the status dot's color; the human-readable text is
   * `last_sync_human` below. */
  sync_status?: string;
  /** Recent Stores only: "2 minutes ago" / "Never synced" — the text shown
   * next to the sync_status dot, instead of the bucket name itself. */
  last_sync_human?: string;
  date: string;
  stores?: number;
  revenue?: string;
  is_demo?: boolean;
  /** The terminal this store syncs from (stores.device_id). Rendered in the
   * fleet row and matched by the fleet search. */
  device_id?: string | null;
  /** Best-effort human name for `device_id` ("Chrome on Windows"), joined
   * from user_devices. Nullable; never branched on. */
  device_label?: string | null;
  is_archived?: boolean;
  archived_at?: string | null;
  account_manager?: { id: string; name: string } | null;
  account_manager_is_explicit?: boolean;
}

export interface AdminBillingTransaction {
  id: string;
  date: string;
  desc: string;
  amount: string;
  status: string;
  reference: string | null;
  receipt_url: string | null;
}

export interface AdminStoreBillingHistory {
  store_id: string;
  store_name: string;
  transactions: AdminBillingTransaction[];
}

export interface RestoreStoreResult {
  message: string;
  was_suspended: boolean;
  suspension_reason: string | null;
  warning: string | null;
}

export interface SecurityAlert {
  title: string;
  source: string;
  time: string;
}

export interface LiveOperations {
  audit_log_entries?: number;
  sync_success_rate_today?: string | null;
}

export interface AdminSummary {
  stats: AdminStat[];
  recent_stores: AdminStoreSummary[];
  live_operations: LiveOperations;
  security_alerts: SecurityAlert[];
}
export type ProbeStatus = "Operational" | "Degraded" | "Unavailable";

export interface HealthProbe {
  name: string;
  status: ProbeStatus;
}

/** A `null` resource means the host could not measure it — render it as
 * unavailable, never as a zero. See web/AGENTS.md. */
export interface AdminHealth {
  overallStatus: string;
  platformAge: string;
  databaseConnectMs: number | null;
  resources: {
    loadAverage: { 1: number; 5: number; 15: number } | null;
    memory: { used: string; total: string; percent: number } | null;
    disk: { used: string; total: string; percent: number } | null;
    database: { status: string };
  };
  probes: HealthProbe[];
}

export interface SentryIssue {
  id: string | null;
  project: string;
  title: string;
  culprit: string | null;
  level: string;
  count: number;
  userCount: number;
  lastSeen: string | null;
  firstSeen: string | null;
  permalink: string | null;
}

export interface AdminErrors {
  configured: boolean;
  issues: SentryIssue[];
}

export type {
  AdminStoreBusinessMetrics,
  AdminStoreOperationalMetrics,
  AdminStoreDetail,
  AdminStoreDetailActivity,
  AdminStoreDetailOwner,
  AdminStoreDetailSubscription,
} from "./admin-store-detail";

export interface GlobalProductSummary {
  id: string;
  name: string;
  category?: string;
  instances?: number;
  avgPrice?: string;
  stockLevel?: "High" | "Critical" | string;
  status?: string;
}

export interface GlobalProductMetrics {
  mostStockedCategory?: { name: string; growth?: string };
  stockAlerts?: { rate?: string; count?: number };
  compliance?: { rate?: string; status?: "Verified" | "Action Required" | string };
}

export interface AdminProductsResponse extends PaginatedResponse<GlobalProductSummary> {
  metrics?: GlobalProductMetrics;
  categories?: string[];
}

export interface EmailTemplateSummary {
  id: number;
  key: string;
  name: string;
  subject: string;
}

export interface EmailTemplate extends EmailTemplateSummary {
  content: string;
  variables: Array<{ name: string; description: string }>;
}

export interface EmailTemplatesResponse {
  templates: EmailTemplateSummary[];
}

export type {
  SocialLinksConfig,
  SubscriptionConfig,
  SuggestionsConfig,
  TierConfig,
  TierFeatures,
  TierLimits,
} from "./admin-config";

export interface AdminBroadcast {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "danger" | "success";
  target_type?: "all" | "specific";
  /** Recipient user ids. The backend stores ids and matches recipients with
   * `whereJsonContains('user_ids', $user->id)` — never full user objects. */
  user_ids?: string[];
  expires_at?: string | null;
  is_active: boolean;
  /** Whether the announcement was also emailed. The email fires once, when
   * the broadcast is created — editing this field later never re-sends. */
  send_email?: boolean;
}

export interface BroadcastFormData {
  title: string;
  message: string;
  type: string;
  target_type: "all" | "specific";
  /** Ids only — see AdminBroadcast.user_ids. */
  user_ids: string[];
  expires_at: string;
  is_active: boolean;
  /** Only honoured on create — see AdminBroadcast.send_email. */
  send_email: boolean;
}

export interface FeedbackItem {
  id: string;
  type: "bug" | "feature_request" | string;
  status: "pending" | "resolved" | "dismissed" | string;
  contact_email?: string;
  content: string;
  created_at: string;
  user_id?: string;
  /** The real number of times this crash fired, kept per fingerprint by
   * `logCrash`. A Sentry event count is a throttled sample; this is not. */
  occurrence_count?: number | null;
}

export type FeedbackResponse = PaginatedResponse<FeedbackItem>;

export interface ActivityLog {
  id: string;
  action: string;
  description?: string;
  created_at: string;
  user?: { name: string; email: string };
  store?: { name: string };
}

/** A platform user's (super_admin/platform_admin/agent) own attribution,
 * separate from the customer-facing ReferralSummary in marketing/types.ts,
 * which is a different program (customer-to-customer, account credit). */
export interface PlatformReferrals {
  platform_referral_code: string | null;
  referral_link: string | null;
  total: number;
  accounts: {
    id: string;
    name: string;
    email: string;
    role: string;
    store_name: string | null;
    registered_at: string;
  }[];
}

export interface Coupon {
  id: string;
  code: string;
  type: "discount_percent" | "discount_amount" | "trial_extension";
  value: number;
  max_uses: number | null;
  max_uses_per_user: number;
  target_plan: string | null;
  target_interval: string | null;
  expires_at: string | null;
  is_active: boolean;
  usages_count: number;
}

export * from "./admin-platform";
export * from "./admin-users";
