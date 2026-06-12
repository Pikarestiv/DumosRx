"use client";

import { useStore } from "@/lib/context/store-context";

export type SubscriptionTier = "free" | "starter" | "local" | "pro" | "enterprise";

export function useFeatureGate() {
  const { storeProfile } = useStore();
  const currentTierRaw = (storeProfile?.subscription_tier as string) || "free";
  // Normalize by stripping " trial" to grant the features of the underlying tier
  const normalizedTier = currentTierRaw.toLowerCase().replace(" trial", "") as SubscriptionTier;

  const isFree = normalizedTier === "free";
  const isStarter = normalizedTier === "starter" || normalizedTier === "local";
  const isPro = normalizedTier === "pro";
  const isEnterprise = normalizedTier === "enterprise";

  return {
    currentTier: normalizedTier,
    // Max staff accounts allowed
    maxStaffAccounts: isEnterprise ? Infinity : isPro ? 10 : isStarter ? 3 : 0,

    // Cloud sync permissions
    canCloudSync: !isFree,

    // Multi-device sync
    canUseMobileApp: isPro || isEnterprise,

    // Multi-store functionality
    canManageMultiStore: isEnterprise,

    // Advanced E-commerce
    canUseEcommerce: isPro || isEnterprise,

    // Auto Backups
    canAutoBackup: isPro || isEnterprise,

    // Minimum sync interval in minutes
    minimumSyncIntervalMinutes: isEnterprise ? 15 : isPro ? 30 : 360,

    // Gated modules & features
    canUsePrescriptions: storeProfile?.store_type === 'pharmacy',
    canUseProcurement: !isFree,
    canUseExpenses: !isFree,
    canUseAuditMode: !isFree,
    canCustomizeTheme: !isFree,
    canUseDarkMode: !isFree,
    canUseSmartSuggestions: isPro || isEnterprise,
    canUseStoreUrl: isPro || isEnterprise,
    canAutoLock: !isFree,
  };
}
