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
  trend: "up" | "down";
  change: string | number;
  name: string;
  value: string | number;
}

export interface AdminStoreSummary {
  id: string;
  name: string;
  owner: string;
  email?: string;
  plan: string;
  status: string;
  date: string;
  stores?: number;
  revenue?: string;
  is_demo?: boolean;
  account_manager?: { id: string; name: string } | null;
  account_manager_is_explicit?: boolean;
}

export interface SecurityAlert {
  title: string;
  source: string;
  time: string;
}

export interface LiveOperations {
  total_requests?: number;
  sync_success_rate?: string;
  active_connections?: number;
}

export interface AdminSummary {
  stats: AdminStat[];
  recent_stores: AdminStoreSummary[];
  live_operations: LiveOperations;
  security_alerts: SecurityAlert[];
}

export interface ServiceNode {
  name: string;
  location?: string;
  status: "Operational" | string;
  latency: string;
}

export interface AdminHealth {
  overallStatus: string;
  uptime: string;
  latency: string;
  resources: {
    cpu: number;
    memory: { used: string; total?: string; percent: number };
    disk: { used: string; total?: string; percent: number };
    database: { load: number; status: string };
  };
  nodes: ServiceNode[];
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
  email: string;
  /** Humanized for display (e.g. "Store Owner"). Use `role_slug` for any
   * role-gated logic, not this. */
  role: string;
  /** Raw role slug (e.g. "store_owner", "admin"): the source of truth for
   * role-based UI logic. */
  role_slug?: string;
  store?: string;
  lastActive?: string;
  joinedAt?: string;
  status: string;
  deletionRequested?: boolean;
}

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
  compliance?: { rate?: string };
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
  web_dashboard: boolean;
  mobile_app: boolean;
  ecommerce: boolean;
  smart_pos: boolean;
  custom_branding: boolean;
  broadcast_create: boolean;
  auto_backup: boolean;
  multi_store: boolean;
  procurement: boolean;
  prescriptions: boolean;
  expenses: boolean;
  audit_mode: boolean;
  dark_mode: boolean;
  smart_suggestions: boolean;
  auto_lock: boolean;
  barcode_generation: boolean;
  loyalty_program: boolean;
}

export interface TierLimits {
  staff: number;
  stores: number;
  sync_interval: number;
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
  user_ids?: AdminUser[];
  expires_at?: string | null;
  is_active: boolean;
}

export interface BroadcastFormData {
  title: string;
  message: string;
  type: string;
  target_type: "all" | "specific";
  user_ids: AdminUser[];
  expires_at: string;
  is_active: boolean;
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
