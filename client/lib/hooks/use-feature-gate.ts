"use client";

import { useStore } from "@/lib/context/store-context";

export type SubscriptionTier = "free" | "starter" | "local" | "pro" | "pro trial" | "enterprise";

export function useFeatureGate() {
  const { storeProfile } = useStore();
  const currentTierRaw = (storeProfile?.subscription_tier as string) || "free";
  const currentTier = currentTierRaw.toLowerCase() as SubscriptionTier;

  const isFree = currentTier === "free";
  const isStarter = currentTier === "starter" || currentTier === "local";
  const isPro = currentTier === "pro" || currentTier === "pro trial";
  const isEnterprise = currentTier === "enterprise";

  return {
    currentTier,
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
    minimumSyncIntervalMinutes: isEnterprise ? 0 : isPro ? 15 : 360,

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
