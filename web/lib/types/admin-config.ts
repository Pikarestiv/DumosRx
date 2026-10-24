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
