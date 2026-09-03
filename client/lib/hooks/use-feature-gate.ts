"use client";

import { useStore } from "@/lib/context/store-context";
import { useSystemConfigStore } from "@/lib/store/system-config-store";
import { toast } from "sonner";
import { isMobileDevice } from "@/lib/utils";

export type SubscriptionTier = "free" | "starter" | "local" | "pro" | "enterprise";

/**
 * The Loyalty Program is gated on BOTH the plan-tier entitlement
 * (`tierAllows`, from getFeature('loyalty_program', ...)) AND the store's
 * own on/off toggle (`stores.loyalty_program_enabled`, DEFAULT 1 so
 * existing Pro/Enterprise stores see no behavior change). `!== 0` treats
 * undefined/null (pre-migration rows) as "on", matching that DEFAULT 1.
 * Extracted as a pure function so the AND logic is unit-testable without a
 * StoreContext/useSystemConfigStore render harness.
 */
export function isLoyaltyProgramEnabled(
  tierAllows: boolean,
  storeToggle: number | undefined | null,
): boolean {
  return tierAllows && storeToggle !== 0;
}

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

  // Helper to dynamically calculate the lowest plan that has a feature
  const getUpgradeMessage = (featureKey: string, fallbackMessage = "This is a premium feature. Please upgrade your plan to access it.") => {
    if (!subscriptionPlans?.tiers) return fallbackMessage;

    const planHierarchy = ["starter", "pro", "enterprise"];
    for (const plan of planHierarchy) {
      const planFeatures = subscriptionPlans.tiers[plan]?.features || {};
      if (planFeatures[featureKey]) {
        const planName = subscriptionPlans.tiers[plan]?.name || plan.charAt(0).toUpperCase() + plan.slice(1);
        return `This feature is available on the ${planName} plan and above.`;
      }
    }
    return fallbackMessage;
  };


  // Universal restriction wrapper for actions.
  // `any[]`/`any` here (not `unknown`) is required: parameter types are
  // checked contravariantly, so a constraint of `(...args: unknown[]) => unknown`
  // would reject every concrete handler (e.g. `(e: React.MouseEvent) => void`),
  // since `unknown` isn't assignable to a concrete parameter type. This is the
  // standard TS idiom for wrapping arbitrary callbacks while preserving their
  // real signature via `Parameters<T>`/`ReturnType<T>` below.
  const withRestriction = <T extends (...args: any[]) => any>(
    action: T,
    options: {
      enforceMobileAccess?: boolean;
      featureAllowed?: boolean;
      featureKey?: string;
    } = {}
  ) => {
    const { enforceMobileAccess = true, featureAllowed, featureKey } = options;
    return (...args: Parameters<T>) => {
      // 1. Mobile restriction check
      if (enforceMobileAccess && typeof window !== "undefined") {
        const isMobile = isMobileDevice();
        const mobileAllowed = getFeature('mobile_app', 'mobile_access', isPro || isEnterprise);
        if (isMobile && !mobileAllowed) {
          toast.error("Mobile Access Locked", {
            description: getUpgradeMessage('mobile_access', "Mobile access is a premium feature. Please upgrade your plan.")
          });
          return;
        }
      }

      // 2. Desktop/General feature restriction check
      if (featureAllowed === false && featureKey) {
        toast.error("Feature Locked", {
          description: getUpgradeMessage(featureKey, "This feature requires a plan upgrade.")
        });
        return;
      }

      return action(...args);
    };
  };

  return {
    withRestriction,
    getUpgradeMessage,
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
    // Ability to hide the "Powered by dumosrx.com" receipt footer; free/starter stores must keep it.
    canRemoveBranding: getFeature('remove_branding', 'white_label', isPro || isEnterprise),
    canUseDarkMode: getFeature('dark_mode', 'dark_mode', !isFree),
    canUseSmartSuggestions: getFeature('smart_suggestions', 'smart_suggestions', isPro || isEnterprise),
    canUseStoreUrl: getFeature('ecommerce', 'store_url', isPro || isEnterprise),
    canAutoLock: getFeature('auto_lock', 'auto_lock', !isFree),
    
    // New Features
    canUseBarcodeGeneration: getFeature('barcode_generation', 'barcode_generation', !isFree),
    // Plan-tier entitlement only (Pro/Enterprise), independent of the
    // store's own on/off toggle. Settings UI uses this (not
    // canUseLoyaltyProgram below) to decide whether to show the "Enable
    // Loyalty Program" switch at all — gating visibility on the combined
    // value would hide the switch the moment it's toggled off, making it
    // impossible to turn back on.
    canAccessLoyaltyProgramPlan: getFeature('loyalty_program', 'loyalty_program', isPro || isEnterprise),
    // Combined gate actually enforced at runtime (POS redemption, points
    // writes): plan tier AND the store's own toggle.
    canUseLoyaltyProgram: isLoyaltyProgramEnabled(
      getFeature('loyalty_program', 'loyalty_program', isPro || isEnterprise),
      storeProfile?.loyalty_program_enabled,
    ),
    canBroadcastCreate: getFeature('broadcast_create', 'broadcast_create', isPro || isEnterprise),
  };
}
