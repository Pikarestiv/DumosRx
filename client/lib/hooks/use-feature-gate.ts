"use client";

import { useStore } from "@/lib/context/store-context";
import { useSystemConfigStore } from "@/lib/store/system-config-store";

export type SubscriptionTier = "free" | "starter" | "local" | "pro" | "enterprise";

export function useFeatureGate() {
  const { storeProfile } = useStore();
  const { subscriptionPlans } = useSystemConfigStore();

  const currentTierRaw = (storeProfile?.subscription_tier as string) || "free";
  // Normalize by stripping " trial" to grant the features of the underlying tier
  const normalizedTier = currentTierRaw.toLowerCase().replace(" trial", "") as SubscriptionTier;

  // "local" uses "starter" config as fallback if not explicitly defined
  const planKey = normalizedTier === "local" ? "starter" : normalizedTier;

  const tierConfig = subscriptionPlans?.tiers?.[planKey];
  const limits = tierConfig?.limits || {};
  const features = tierConfig?.features || {};

  const isFree = normalizedTier === "free";
  const isStarter = normalizedTier === "starter" || normalizedTier === "local";
  const isPro = normalizedTier === "pro";
  const isEnterprise = normalizedTier === "enterprise";

  // Helpers to resolve limit with fallback
  const getLimit = (key: string, fallback: number) => {
    if (limits[key] !== undefined) {
      return limits[key] === -1 ? Infinity : limits[key];
    }
    return fallback;
  };

  // Helpers to resolve boolean feature with fallback
  const getFeature = (key: string, altKey: string, fallback: boolean) => {
    if (features[key] !== undefined) return Boolean(features[key]);
    if (features[altKey] !== undefined) return Boolean(features[altKey]);
    return fallback;
  };

  return {
    currentTier: normalizedTier,
    // Max staff accounts allowed
    maxStaffAccounts: getLimit('staff', isEnterprise ? Infinity : isPro ? 10 : isStarter ? 3 : 0),

    // Cloud sync permissions
    canCloudSync: getFeature('cloud_sync', 'cloud_sync', !isFree),

    // Multi-device sync
    canUseMobileApp: getFeature('mobile_app', 'mobile_access', isPro || isEnterprise),

    // Multi-store functionality
    canManageMultiStore: getFeature('multi_store', 'multi_store', isEnterprise),

    // Advanced E-commerce
    canUseEcommerce: getFeature('ecommerce', 'store_url', isPro || isEnterprise),

    // Auto Backups
    canAutoBackup: getFeature('auto_backup', 'auto_backup', isPro || isEnterprise),

    // Minimum sync interval in minutes
    minimumSyncIntervalMinutes: getLimit('sync_interval', isEnterprise ? 15 : isPro ? 30 : 360),

    // Gated modules & features
    canUsePrescriptions: storeProfile?.store_type === 'pharmacy' ? getFeature('prescriptions', 'prescriptions', true) : false,
    canUseProcurement: getFeature('procurement', 'procurement', !isFree),
    canUseExpenses: getFeature('expenses', 'expenses', !isFree),
    canUseAuditMode: getFeature('audit_mode', 'audit_mode', !isFree),
    canCustomizeTheme: getFeature('custom_branding', 'theme_customizer', !isFree),
    canUseDarkMode: getFeature('dark_mode', 'dark_mode', !isFree),
    canUseSmartSuggestions: getFeature('smart_suggestions', 'smart_suggestions', isPro || isEnterprise),
    canUseStoreUrl: getFeature('ecommerce', 'store_url', isPro || isEnterprise),
    canAutoLock: getFeature('auto_lock', 'auto_lock', !isFree),
  };
}
