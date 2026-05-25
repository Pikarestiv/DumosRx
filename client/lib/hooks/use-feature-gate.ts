"use client";

import { useStore } from "@/lib/context/store-context";

export type SubscriptionTier = "free" | "local" | "pro" | "enterprise";

export function useFeatureGate() {
  const { storeProfile } = useStore();
  const currentTier: SubscriptionTier =
    storeProfile?.subscription_tier || "free";

  const isPro = currentTier === "pro";
  const isEnterprise = currentTier === "enterprise";

  return {
    currentTier,
    // Max staff accounts allowed
    maxStaffAccounts: isEnterprise ? Infinity : isPro ? 10 : 3,

    // Cloud sync permissions
    canCloudSync: isPro || isEnterprise,

    // Multi-device sync
    canUseMobileApp: isPro || isEnterprise,

    // Multi-store functionality
    canManageMultiStore: isEnterprise,

    // Advanced E-commerce
    canUseEcommerce: isEnterprise,

    // Auto Backups
    canAutoBackup: isPro || isEnterprise,

    // Minimum sync interval in minutes
    minimumSyncIntervalMinutes: isEnterprise ? 15 : 30,
  };
}
