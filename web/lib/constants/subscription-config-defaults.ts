import type {
  SubscriptionConfig,
  SocialLinksConfig,
  TierConfig,
} from "@/lib/types/admin";

export const DEFAULT_TIER_CONFIGS: SubscriptionConfig["tiers"] = {
  free: {
    price_monthly: 0,
    price_yearly: 0,
    active: true,
    limits: { staff: 1, stores: 1, sync_interval: 360 },
    features: {
      cloud_sync: false,
      mobile_app: false,
      ecommerce: false,
      smart_pos: true,
      custom_branding: false,
      remove_branding: false,
      daily_summary_email: false,
      procurement: false,
      prescriptions: false,
      expenses: false,
      audit_mode: false,
      dark_mode: true,
      smart_suggestions: false,
      auto_lock: true,
      barcode_generation: false,
      loyalty_program: false,
      advanced_reports: false,
      reseller_commission: false,
      proforma_quotes: false,
      daily_close_report: false,
    },
  },
  starter: {
    price_monthly: 3000,
    price_yearly: 30000,
    active: true,
    limits: { staff: 3, stores: 1, sync_interval: 30 },
    features: {
      cloud_sync: true,
      mobile_app: false,
      ecommerce: false,
      smart_pos: true,
      custom_branding: false,
      remove_branding: false,
      daily_summary_email: false,
      procurement: true,
      prescriptions: true,
      expenses: true,
      audit_mode: false,
      dark_mode: true,
      smart_suggestions: false,
      auto_lock: true,
      barcode_generation: true,
      loyalty_program: false,
      advanced_reports: false,
      reseller_commission: false,
      proforma_quotes: false,
      daily_close_report: true,
    },
  },
  pro: {
    price_monthly: 8000,
    price_yearly: 80000,
    active: true,
    limits: { staff: 10, stores: 3, sync_interval: 15 },
    features: {
      cloud_sync: true,
      mobile_app: true,
      ecommerce: false,
      smart_pos: true,
      custom_branding: true,
      remove_branding: true,
      daily_summary_email: true,
      procurement: true,
      prescriptions: true,
      expenses: true,
      audit_mode: true,
      dark_mode: true,
      smart_suggestions: true,
      auto_lock: true,
      barcode_generation: true,
      loyalty_program: true,
      advanced_reports: true,
      reseller_commission: true,
      proforma_quotes: true,
      daily_close_report: true,
    },
  },
  enterprise: {
    price_monthly: 15000,
    price_yearly: 150000,
    active: true,
    limits: { staff: 50, stores: 20, sync_interval: 0 },
    features: {
      cloud_sync: true,
      mobile_app: true,
      ecommerce: true,
      smart_pos: true,
      custom_branding: true,
      remove_branding: true,
      daily_summary_email: true,
      procurement: true,
      prescriptions: true,
      expenses: true,
      audit_mode: true,
      dark_mode: true,
      smart_suggestions: true,
      auto_lock: true,
      barcode_generation: true,
      loyalty_program: true,
      advanced_reports: true,
      reseller_commission: true,
      proforma_quotes: true,
      daily_close_report: true,
    },
  },
};

export const DEFAULT_SUBSCRIPTION_CONFIG: SubscriptionConfig = {
  trial_days: 14,
  trial_plan: "pro",
  grace_period_days: 3,
  enable_paystack: true,
  enable_flutterwave: true,
  enable_manual_payment: true,
  manual_payment_bank: "Moniepoint",
  manual_payment_account_number: "6656081317",
  manual_payment_account_name: "Dumos Technologies",
  tiers: DEFAULT_TIER_CONFIGS,
};

export const DEFAULT_SOCIAL_LINKS: SocialLinksConfig = {
  twitter: "",
  facebook: "",
  linkedin: "",
  github: "",
  instagram: "",
  active_links: {
    twitter: true,
    facebook: true,
    linkedin: true,
    github: true,
    instagram: true,
  },
};

const TIER_KEYS = ["free", "starter", "pro", "enterprise"] as const;

function mergeTierConfig(
  serverTier: Partial<TierConfig> | undefined,
  defaultTier: TierConfig,
): TierConfig {
  return {
    price_monthly: serverTier?.price_monthly ?? defaultTier.price_monthly,
    price_yearly: serverTier?.price_yearly ?? defaultTier.price_yearly,
    active: serverTier?.active ?? defaultTier.active,
    limits: serverTier?.limits ?? defaultTier.limits,
    features: serverTier?.features ?? defaultTier.features,
  };
}

/** Fills in any field the server config is missing (a brand-new/never-saved
 * key, or one saved before a newer field existed) with the matching default,
 * per-tier and per-field rather than falling back to the whole object -
 * otherwise a server config missing just one new field would silently
 * discard every other field it already had saved. */
export function mergeSubscriptionConfig(
  serverConfig: Partial<SubscriptionConfig> | undefined,
): SubscriptionConfig {
  if (!serverConfig) return DEFAULT_SUBSCRIPTION_CONFIG;

  const tiers = Object.fromEntries(
    TIER_KEYS.map((key) => [
      key,
      mergeTierConfig(serverConfig.tiers?.[key], DEFAULT_TIER_CONFIGS[key]),
    ]),
  ) as SubscriptionConfig["tiers"];

  return {
    trial_days: serverConfig.trial_days ?? DEFAULT_SUBSCRIPTION_CONFIG.trial_days,
    trial_plan: serverConfig.trial_plan ?? DEFAULT_SUBSCRIPTION_CONFIG.trial_plan,
    grace_period_days:
      serverConfig.grace_period_days ?? DEFAULT_SUBSCRIPTION_CONFIG.grace_period_days,
    enable_paystack:
      serverConfig.enable_paystack ?? DEFAULT_SUBSCRIPTION_CONFIG.enable_paystack,
    enable_flutterwave:
      serverConfig.enable_flutterwave ?? DEFAULT_SUBSCRIPTION_CONFIG.enable_flutterwave,
    enable_manual_payment:
      serverConfig.enable_manual_payment ?? DEFAULT_SUBSCRIPTION_CONFIG.enable_manual_payment,
    manual_payment_bank:
      serverConfig.manual_payment_bank ?? DEFAULT_SUBSCRIPTION_CONFIG.manual_payment_bank,
    manual_payment_account_number:
      serverConfig.manual_payment_account_number ??
      DEFAULT_SUBSCRIPTION_CONFIG.manual_payment_account_number,
    manual_payment_account_name:
      serverConfig.manual_payment_account_name ??
      DEFAULT_SUBSCRIPTION_CONFIG.manual_payment_account_name,
    tiers,
  };
}

export function mergeSocialLinks(
  serverConfig: Partial<SocialLinksConfig> | undefined,
): SocialLinksConfig {
  if (!serverConfig) return DEFAULT_SOCIAL_LINKS;

  return {
    twitter: serverConfig.twitter || "",
    facebook: serverConfig.facebook || "",
    linkedin: serverConfig.linkedin || "",
    github: serverConfig.github || "",
    instagram: serverConfig.instagram || "",
    active_links: {
      twitter: serverConfig.active_links?.twitter ?? true,
      facebook: serverConfig.active_links?.facebook ?? true,
      linkedin: serverConfig.active_links?.linkedin ?? true,
      github: serverConfig.active_links?.github ?? true,
      instagram: serverConfig.active_links?.instagram ?? true,
    },
  };
}
