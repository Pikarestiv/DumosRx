"use client";

import { useStore } from "@/lib/context/store-context";
import { useSystemConfigStore } from "@/lib/store/system-config-store";
import { toast } from "sonner";
import { isMobileDevice } from "@/lib/utils";

export type SubscriptionTier = "free" | "starter" | "local" | "pro" | "enterprise";

// The Loyalty Program is gated on BOTH the plan-tier entitlement (`tierAllows`, from getFeature('loyalty_program', ...)) AND the store's own o…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-feature-gate-ts-L10
export function isLoyaltyProgramEnabled(
  tierAllows: boolean,
  storeToggle: number | undefined | null,
): boolean {
  return tierAllows && storeToggle !== 0;
}

// The POS cart's "Reseller sale" row (both the reseller-commission and store-markup sub-types) is gated on BOTH the plan-tier entitlement (`ti…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-feature-gate-L26
export function isMarkupSalesEnabled(
  tierAllows: boolean,
  storeToggle: number | undefined | null,
): boolean {
  return tierAllows && storeToggle === 1;
}

// Fallback used only when the server's subscription_plans config has no explicit `limits.sync_interval` for the current tier (see getLimit() b…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-feature-gate-ts-L35
export function getDefaultMinimumSyncIntervalMinutes(
  isEnterprise: boolean,
  isPro: boolean,
  isStarter: boolean,
): number {
  return isEnterprise ? 0 : isPro ? 15 : isStarter ? 30 : 360;
}

// A store limit of 1 can never support more than one store; anything above that always can.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-feature-gate-ts-L50
export function hasMultiStoreAccess(storesLimit: number): boolean {
  return storesLimit > 1;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  const maxStores = getLimit('stores', isEnterprise ? 20 : isPro ? 3 : 1);

  return {
    withRestriction,
    getUpgradeMessage,
    currentTier: normalizedTier,
    // Max staff accounts allowed
    maxStaffAccounts: getLimit('staff', isEnterprise ? Infinity : isPro ? 10 : isStarter ? 3 : 0),
    // Max stores/branches allowed — not enforced anywhere client-side yet (nothing today caps store creation against this), but needed so canManag…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-feature-gate-ts-L145
    maxStores,

    // Cloud sync permissions
    canCloudSync: getFeature('cloud_sync', 'cloud_sync', !isFree),

    // Multi-device sync
    canUseMobileApp: getFeature('mobile_app', 'mobile_access', isPro || isEnterprise),

    // Multi-store functionality, derived directly from the `stores` limit instead of a separately admin-configured boolean — the two could disagre…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-feature-gate-ts-L156
    canManageMultiStore: hasMultiStoreAccess(maxStores),

    // Advanced E-commerce — Enterprise-only:
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-feature-gate-ts-L164
    canUseEcommerce: getFeature('ecommerce', 'store_url', isEnterprise),

    // Core POS/checkout access.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-feature-gate-ts-L169
    canUseSmartPos: getFeature('smart_pos', 'smart_pos', true),

    // Minimum sync interval in minutes (0 = sync instantly on any change)
    minimumSyncIntervalMinutes: getLimit(
      'sync_interval',
      getDefaultMinimumSyncIntervalMinutes(isEnterprise, isPro, isStarter),
    ),

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
    canUseAiAssistant: getFeature('ai_assistant', 'ai_assistant', isPro || isEnterprise),
    canAutoLock: getFeature('auto_lock', 'auto_lock', !isFree),
    
    // New Features
    canUseBarcodeGeneration: getFeature('barcode_generation', 'barcode_generation', !isFree),
    // Plan-tier entitlement only (Pro/Enterprise), independent of the store's own on/off toggle.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-feature-gate-ts-L198
    canAccessLoyaltyProgramPlan: getFeature('loyalty_program', 'loyalty_program', isPro || isEnterprise),
    // Combined gate actually enforced at runtime (POS redemption, points
    // writes): plan tier AND the store's own toggle.
    canUseLoyaltyProgram: isLoyaltyProgramEnabled(
      getFeature('loyalty_program', 'loyalty_program', isPro || isEnterprise),
      storeProfile?.loyalty_program_enabled,
    ),
    // Report Center's non-daily-close reports (other report types, cross- report filtering) plus the BI/analytics dashboard and their CSV/PDF expo…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-feature-gate-ts-L211
    canUseAdvancedReports: getFeature('advanced_reports', 'advanced_reports', isPro || isEnterprise),
    canCreateCustomPermissionGroups: getFeature('custom_permission_groups', 'custom_permission_groups', isPro || isEnterprise),
    // Plan-tier entitlement only, independent of the store's own toggle - same reasoning as canAccessLoyaltyProgramPlan above.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-feature-gate-ts-L216
    canUseResellerCommission: getFeature('reseller_commission', 'reseller_commission', isPro || isEnterprise),
    // Combined gate actually enforced at runtime (the POS cart's "Reseller
    // sale" row): plan tier AND the store's own toggle.
    canUseMarkupSales: isMarkupSalesEnabled(
      getFeature('reseller_commission', 'reseller_commission', isPro || isEnterprise),
      storeProfile?.markup_sales_enabled,
    ),
    // The POS "Preview Quote" (proforma) flow.
    canUseProformaQuotes: getFeature('proforma_quotes', 'proforma_quotes', isPro || isEnterprise),
    // The End-of-Day / Daily Close report tab, including its own export — deliberately Starter+ (not Pro-only), matching expenses/procurement/ pre…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-feature-gate-ts-L229
    canUseDailyCloseReport: getFeature('daily_close_report', 'daily_close_report', !isFree),
  };
}
