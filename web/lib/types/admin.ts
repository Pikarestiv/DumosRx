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

/** A `null` rate means nothing has synced in the window — render it as such,
 * never as 0%. See web/AGENTS.md. */
export interface AdminSyncHealth {
  success_rate_today: string | null;
  success_rate_7d: string | null;
  failures_by_reason: Record<string, number>;
  worst_stores: Array<{ store_id: string; store_name: string | null; refused: number }>;
}

export interface SyncFailureRow {
  id: string;
  table_name: string;
  record_id: string | null;
  operation: string | null;
  reason: string;
  created_at: string | null;
}

export interface AdminStoreSyncHealth {
  store_name: string | null;
  last_sync_at: string | null;
  daily: Array<{ date: string; accepted: number; refused: number; conflicted: number }>;
  failures: { data: SyncFailureRow[]; meta?: PaginationMeta };
}

export type SubscriptionBucket = "expiring" | "trials" | "lapsed" | "payments";

export interface SubscriptionWorklistRow {
  user_id: string;
  owner_name: string;
  email: string;
  store_id: string | null;
  store_name: string | null;
  plan: string | null;
  is_trial: boolean;
  end_date: string | null;
  attempts?: number;
  last_attempt_at?: string | null;
  last_status?: string;
  amount?: number;
  currency?: string;
}

export interface AdminSubscriptionWorklist {
  data: SubscriptionWorklistRow[];
  meta?: PaginationMeta;
}

/** `trial_conversion_rate` is null when no trials started in the window —
 * render it as unavailable, never 0% or 100%. See web/AGENTS.md. */
export interface AdminSubscriptionFigures {
  trials_started: number;
  trial_conversion_rate: string | null;
  lapsed_in_period: number;
  recovered_in_period: number;
  payment_mix: { success: number; failed: number; abandoned: number; pending: number };
  bucket_counts: Record<SubscriptionBucket, number>;
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

export interface AdminUser {
  id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  email: string;
  /** Humanized for display (e.g. "Store Owner"). Use `role_slug` for any
   * role-gated logic, not this. */
  role: string;
  /** Raw role slug (e.g. "store_owner", "admin"): the source of truth for
   * role-based UI logic. */
  role_slug?: string;
  store?: string;
  /** Id of the store this account owns, else the store it is staff at, else
   * null for a platform-level account. Mirrors `store` (the display name). */
  store_id?: string | null;
  /** True only when the account OWNS a store (stores.user_id), as opposed to
   * working at one (users.store_id). See `AdminAccountType`. */
  is_store_owner?: boolean;
  lastActive?: string;
  joinedAt?: string;
  status: string;
  deletionRequested?: boolean;
  /** Not yet returned by `GET /admin/users` — see docs/KNOWN_BUGS.md A-133. */
  effective_permissions?: string[];
  /** Relative time ("5 minutes ago") of this account's most recently
   * synced device, or null if it has never synced. Login activity
   * (`lastActive` above) and sync activity are tracked separately - a
   * staff member can be logged in on a device that hasn't synced yet. */
  lastSyncedAt?: string | null;
  /** That device's human-readable label (e.g. "Chrome on Windows"), falling
   * back to its raw id if unlabeled. See `useStaffDevices` for the full
   * per-device history. */
  lastSyncDevice?: string | null;
}

/** One row of a staff member's full sync history - `GET
 * /admin/users/{id}/devices`, most recent first. */
export interface AdminUserDevice {
  deviceId: string;
  deviceLabel: string;
  storeId: string | null;
  lastSyncedAt: string | null;
  lastSyncedAtIso: string | null;
}

/** The 3 built-in platform roles. NOT the full set `PUT /admin/users/{id}`
 * accepts: that endpoint validates against `UpdatesUserProfiles::platformRoleSlugs()`,
 * which also includes every custom platform role. Any UI offering or
 * validating a role must merge these with `useAdminRoles()` (see
 * `mergePlatformRoleOptions()`); these 3 are only the always-present floor.
 * Store-tenant roles stay unassignable from the platform panel either way. */
export const PLATFORM_ROLE_SLUGS = ["super_admin", "platform_admin", "agent"] as const;

export type BuiltInPlatformRoleSlug = (typeof PLATFORM_ROLE_SLUGS)[number];

/** A platform role slug: one of the 3 built-ins or a custom role's slug. */
export type PlatformRoleSlug = string;

/** The field scope of PUT /admin/users/{id}. Password, account status and
 * plan deliberately stay with their own endpoints. */
export interface AdminUserProfileUpdate {
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  email?: string;
  role?: PlatformRoleSlug;
}

/** `account_type` on GET /admin/users. "owners" own a store, "staff" work at
 * one, "platform" have no store affiliation at all; omitting it returns
 * every account. */
export type AdminAccountType = "owners" | "staff" | "platform";

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

export interface TierFeatures {
  cloud_sync: boolean;
  /** Access to the hosted web dashboard. Real key in the stored config (see
   * SystemConfigSeeder) and read by the public pricing copy - it was just
   * missing from this type, the plan editor and the bundled defaults, which
   * made it read as permanently false. */
  web_dashboard: boolean;
  mobile_app: boolean;
  ecommerce: boolean;
  smart_pos: boolean;
  custom_branding: boolean;
  remove_branding: boolean;
  daily_summary_email: boolean;
  procurement: boolean;
  prescriptions: boolean;
  expenses: boolean;
  audit_mode: boolean;
  dark_mode: boolean;
  smart_suggestions: boolean;
  ai_assistant: boolean;
  auto_lock: boolean;
  barcode_generation: boolean;
  loyalty_program: boolean;
  advanced_reports: boolean;
  reseller_commission: boolean;
  proforma_quotes: boolean;
  daily_close_report: boolean;
}

export interface TierLimits {
  staff: number;
  stores: number;
  sync_interval: number;
  /** Real field in the stored config (max catalog items; -1 = unlimited)
   * but not currently read by any gating code or exposed in this editor's
   * UI — kept optional so tiers that don't set it don't break typing. */
  inventories?: number;
}

export interface TierConfig {
  price_monthly: number;
  price_yearly: number;
  active: boolean;
  limits: TierLimits;
  features: TierFeatures;
}

export interface SubscriptionConfig {
  trial_days: number;
  trial_plan: string;
  grace_period_days: number;
  enable_paystack: boolean;
  enable_flutterwave: boolean;
  enable_manual_payment: boolean;
  manual_payment_bank: string;
  manual_payment_account_number: string;
  manual_payment_account_name: string;
  tiers: {
    free: TierConfig;
    starter: TierConfig;
    pro: TierConfig;
    enterprise: TierConfig;
  };
}

export interface SocialLinksConfig {
  twitter: string;
  facebook: string;
  linkedin: string;
  github: string;
  instagram: string;
  active_links: {
    twitter: boolean;
    facebook: boolean;
    linkedin: boolean;
    github: boolean;
    instagram: boolean;
  };
}

export interface SuggestionsConfig {
  store: {
    names: string[];
    generics: string[];
    categories: string[];
    manufacturers: string[];
    strengths: string[];
    dosageForms: string[];
  };
  retail: {
    names: string[];
    categories: string[];
    manufacturers: string[];
  };
}

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

export interface PendingMigration {
  name: string;
  alters_existing_data: boolean;
}

export interface AdminMigrationStatus {
  status: "ok" | "unknown";
  pending: PendingMigration[];
  pending_count: number | null;
  last_batch: number | null;
  error: string | null;
}
