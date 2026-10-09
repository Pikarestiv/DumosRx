"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTheme } from "@/components/theme-provider";
import { useStore, StoreType } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { hasPermission } from "@/lib/hooks/use-permissions";
import {
  ALL_SETTINGS_TABS,
  canAccessSettingsTab,
} from "@/lib/constants/settings-tabs";
import { toast } from "sonner";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { apiClient } from "@/lib/api/client";
import { useSettingsForm } from "./use-settings-form";
import { useSettingsSecurity } from "./use-settings-security";
import { useSettingsSync } from "./use-settings-sync";
import { useSettingsTabResolution } from "./use-settings-tab-resolution";

/**
 * Resolves the user's typed/selected auto-sync interval against the
 * store's plan-tier minimum. `0` (instant sync) is a real, meaningful
 * value distinct from "unset" — parseInt(rawInput) || 15 would silently
 * coerce "0" to 15 (0 is falsy), so this checks for NaN explicitly instead.
 * Extracted as a pure function so the clamp logic is unit-testable without
 * a StoreContext render harness.
 */
export function resolveAutoSyncInterval(
  rawInput: string,
  enabled: boolean,
  minimumMinutes: number,
): number {
  const parsed = parseInt(rawInput, 10);
  let interval = Number.isNaN(parsed) ? 15 : parsed;
  if (enabled && interval < minimumMinutes) {
    interval = minimumMinutes;
  }
  return interval;
}

export function useSettings() {
  const { theme, setTheme } = useTheme();
  const { user, isAdmin, changePin, isCloudLinked, permissionGroup } = useAuth();
  const {
    storeProfile,
    storeType,
    updateStoreProfile,
    theme: activeTheme,
    setTheme: setAppTheme,
    refetch: refetchStore,
  } = useStore();

  const { minimumSyncIntervalMinutes, canRemoveBranding, canAccessLoyaltyProgramPlan } = useFeatureGate();

  const router = useRouter();
  const params = useParams();
  const tabParam = params?.tab as string;
  const [activeTab, setActiveTab] = useState(tabParam || "appearance");
  const [isDesktop, setIsDesktop] = useState(true);

  // "/settings" (root, isIndex) and "/settings/[tab]" are separate route
  // chunks even though they render the same SettingsClient — the sidebar's
  // <Link> only auto-prefetches whichever one it points to ("/settings"),
  // so landing there first and then clicking any tab (all of which share
  // this one "[tab]" chunk) pays a real first-time network+parse cost with
  // nothing yet on screen — the same gap confirmed live for Inventory's
  // Catalog/Movements tabs. Prefetching one representative tab warms that
  // shared chunk for every tab, not just this one; a no-op if we're
  // already on a "[tab]" route ourselves.
  useEffect(() => {
    router.prefetch("/settings/appearance");
  }, [router]);

  const securityState = useSettingsSecurity(changePin);
  const syncState = useSettingsSync(isCloudLinked, refetchStore);
  const formState = useSettingsForm(storeProfile, minimumSyncIntervalMinutes);

  const {
    localName,
    localCurrency,
    localVat,
    localResellerCommission,
    localReceiptHeader,
    localReceiptFooter,
    localReceiptTagline,
    showLogo,
    logoPosition,
    showPhone,
    showAddress,
    hidePoweredBy,
    lowStockAlert,
    expiryAlert,
    expiryDays,
    localStoreSlug,
    setLocalStoreSlug,
    localAddress,
    localPhone,
    localEmail,
    localPcn,
    localRegistrationNumber,
    localTaxNumber,
    showRetailSuggestions,
    requirePaymentAccount,
    onlineStoreEnabled,
    loyaltyProgramEnabled,
    enabledPaymentMethods,
    autoSyncEnabled,
    autoSyncInterval,
    setAutoSyncInterval,
    setLocalLogo,
  } = formState;

  // Responsive Effect
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const hasKey = useCallback(
    (key: string) => hasPermission(user, permissionGroup, key),
    [user, permissionGroup],
  );

  const { canAccessTab } = useSettingsTabResolution({
    tabParam,
    activeTab,
    setActiveTab,
    isAdmin,
    hasKey,
    isCloudLinked,
    openCloudLink: syncState.setIsCloudLinkOpen,
  });

  // Tab change handler that updates URL
  const handleTabChange = (value: string) => {
    let publicTab = value;
    if (value === "appearance") {
      publicTab = "general";
    } else if (value === "notifications") {
      publicTab = "alerts";
    }

    if (activeTab !== value) {
      setActiveTab(value);
    }

    router.replace(`/settings/${publicTab}`, { scroll: false });
  };

  // Handlers
  const handleSaveProfile = async () => {
    let finalSlug = localStoreSlug;
    if (localStoreSlug && localStoreSlug !== storeProfile?.store_slug) {
      try {
        const result = await apiClient.checkStoreSlug(localStoreSlug, storeProfile?.id);
        if (!result.available) {
          toast.error("That Store URL Slug is already taken. Please choose another.");
          return;
        }
        finalSlug = result.slug;
        setLocalStoreSlug(result.slug);
      } catch (err) {
        toast.error("Failed to verify store URL. Please check your internet connection.");
        return;
      }
    }

    void updateStoreProfile({
      name: localName,
      address: localAddress,
      phone: localPhone,
      email: localEmail,
      store_slug: finalSlug,
      pcn_license: localPcn,
      registration_number: localRegistrationNumber,
      tax_number: localTaxNumber,
      show_retail_suggestions: showRetailSuggestions ? 1 : 0,
      require_payment_account: requirePaymentAccount ? 1 : 0,
      online_store_enabled: onlineStoreEnabled ? 1 : 0,
      // Only meaningful (and shown) for Pro/Enterprise stores — see
      // canUseLoyaltyProgram — but persisted here regardless so the value
      // is preserved if the store later downgrades and re-upgrades.
      loyalty_program_enabled: loyaltyProgramEnabled ? 1 : 0,
      enabled_payment_methods: JSON.stringify(enabledPaymentMethods),
      updated_at: new Date().toISOString(),
    });
    toast.success("Store profile updated");
  };

  const handleSaveRegional = () => {
    void updateStoreProfile({
      currency: localCurrency,
      vat_percentage: parseFloat(localVat) || 0,
      reseller_commission_percentage: parseFloat(localResellerCommission) || 0,
    });
    toast.success("Regional settings updated");
  };

  const handleSaveReceiptSettings = () => {
    void updateStoreProfile({
      receipt_header: localReceiptHeader,
      receipt_footer: localReceiptFooter,
      receipt_tagline: localReceiptTagline,
      show_logo_on_receipt: showLogo ? 1 : 0,
      receipt_logo_position: logoPosition,
      show_phone_on_receipt: showPhone ? 1 : 0,
      show_address_on_receipt: showAddress ? 1 : 0,
      // Only plans with canRemoveBranding may actually persist this as hidden.
      // Enforced here (not just in the UI) so a stale/tampered local value can't sneak past the gate.
      hide_powered_by: hidePoweredBy && canRemoveBranding ? 1 : 0,
    });
    toast.success("Receipt settings updated");
  };

  const handleSaveAlertSettings = () => {
    void updateStoreProfile({
      low_stock_warning: lowStockAlert ? 1 : 0,
      expiry_warning: expiryAlert ? 1 : 0,
      expiry_warning_days: parseInt(expiryDays) || 90,
    });
    toast.success("Alert preferences updated");
  };

  const handleSaveAutoSyncSettings = () => {
    const interval = resolveAutoSyncInterval(
      autoSyncInterval,
      autoSyncEnabled,
      minimumSyncIntervalMinutes,
    );
    if (interval.toString() !== autoSyncInterval) {
      setAutoSyncInterval(interval.toString());
    }

    void updateStoreProfile({
      auto_sync_enabled: autoSyncEnabled ? 1 : 0,
      auto_sync_interval: interval,
    });
    toast.success("Auto-sync preferences updated");
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast.error("Logo file too large. Max 1MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setLocalLogo(base64);
      void updateStoreProfile({ logo_url: base64 });
      toast.success("Logo updated successfully");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLocalLogo("");
    void updateStoreProfile({ logo_url: "" });
    toast.success("Logo removed");
  };

  const handleSwitchVertical = (type: StoreType) => {
    void updateStoreProfile({ store_type: type });
    toast.success(`Switched to ${type.charAt(0).toUpperCase() + type.slice(1)} mode`);
  };

  return {
    storeProfile,
    user,
    theme,
    setTheme,
    isAdmin,
    canAccessTab,
    isCloudLinked,
    storeType,
    canAccessLoyaltyProgramPlan,
    activeTheme,
    setAppTheme,
    activeTab,
    setActiveTab,
    handleTabChange,
    isDesktop,
    ...securityState,
    ...syncState,
    ...formState,
    handleSaveProfile,
    handleSaveRegional,
    handleSaveReceiptSettings,
    handleSaveAlertSettings,
    handleSaveAutoSyncSettings,
    handleLogoUpload,
    handleRemoveLogo,
    handleSwitchVertical,
  };
}

/** Panels take this whole bag instead of having each field threaded through
 * as its own prop — see app/(dashboard)/settings/[tab]/panels/. */
export type SettingsState = ReturnType<typeof useSettings>;
