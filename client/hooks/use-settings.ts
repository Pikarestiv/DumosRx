"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTheme } from "@/components/theme-provider";
import { useStore, StoreType } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { toast } from "sonner";
import { isTauri } from "@/lib/db/core";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { apiClient } from "@/lib/api/client";
import { useSettingsForm } from "./use-settings-form";
import { useSettingsSecurity } from "./use-settings-security";
import { useSettingsSync } from "./use-settings-sync";

export function useSettings() {
  const { theme, setTheme } = useTheme();
  const { user, isAdmin, changePin, isCloudLinked } = useAuth();
  const {
    storeProfile,
    storeType,
    updateStoreProfile,
    theme: activeTheme,
    setTheme: setAppTheme,
    refetch: refetchStore,
  } = useStore();

  const { minimumSyncIntervalMinutes } = useFeatureGate();

  const router = useRouter();
  const params = useParams();
  const tabParam = params?.tab as string;
  const [activeTab, setActiveTab] = useState(tabParam || "appearance");
  const [isDesktop, setIsDesktop] = useState(true);

  const securityState = useSettingsSecurity(changePin);
  const syncState = useSettingsSync(isCloudLinked, refetchStore);
  const formState = useSettingsForm(storeProfile, minimumSyncIntervalMinutes);

  const {
    localName,
    localCurrency,
    localVat,
    localReceiptHeader,
    localReceiptFooter,
    showLogo,
    showContact,
    lowStockAlert,
    expiryAlert,
    expiryDays,
    localStoreSlug,
    setLocalStoreSlug,
    localAddress,
    localPhone,
    localEmail,
    localPcn,
    showRetailSuggestions,
    requirePaymentAccount,
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

  // Tab activation from URL
  useEffect(() => {
    const tab = tabParam;
    if (tab) {
      let internalTab = tab;
      if (tab === "general") {
        internalTab = "appearance";
      } else if (tab === "alerts") {
        internalTab = "notifications";
      }

      if (internalTab === "cloud" || internalTab === "data") {
        if (!isAdmin) {
          setActiveTab("appearance");
          return;
        }
        if (activeTab !== "data") {
          setActiveTab("data");
        }
        if (internalTab === "cloud" && !isCloudLinked) {
          syncState.setIsCloudLinkOpen(true);
        }
      } else if (["appearance", "store", "notifications", "security", "staff", "system"].includes(internalTab)) {
        if (!isAdmin && ["store", "data", "staff", "system", "cloud"].includes(internalTab)) {
          setActiveTab("appearance");
          return;
        }
        if (activeTab !== internalTab) {
          setActiveTab(internalTab);
        }
      }
    }
  }, [tabParam, isCloudLinked, isAdmin, activeTab, syncState]);

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

    updateStoreProfile({
      name: localName,
      address: localAddress,
      phone: localPhone,
      email: localEmail,
      store_slug: finalSlug,
      pcn_license: localPcn,
      show_retail_suggestions: showRetailSuggestions ? 1 : 0,
      require_payment_account: requirePaymentAccount ? 1 : 0,
      enabled_payment_methods: JSON.stringify(enabledPaymentMethods),
      updated_at: new Date().toISOString(),
    });
    toast.success("Store profile updated");
  };

  const handleSaveRegional = () => {
    updateStoreProfile({
      currency: localCurrency,
      vat_percentage: parseFloat(localVat) || 0,
    });
    toast.success("Regional settings updated");
  };

  const handleSaveReceiptSettings = () => {
    updateStoreProfile({
      receipt_header: localReceiptHeader,
      receipt_footer: localReceiptFooter,
      show_logo_on_receipt: showLogo ? 1 : 0,
      show_contact_on_receipt: showContact ? 1 : 0,
    });
    toast.success("Receipt settings updated");
  };

  const handleSaveAlertSettings = () => {
    updateStoreProfile({
      low_stock_warning: lowStockAlert ? 1 : 0,
      expiry_warning: expiryAlert ? 1 : 0,
      expiry_warning_days: parseInt(expiryDays) || 90,
    });
    toast.success("Alert preferences updated");
  };

  const handleSaveAutoSyncSettings = () => {
    let interval = parseInt(autoSyncInterval) || 15;
    if (autoSyncEnabled && interval < minimumSyncIntervalMinutes) {
      interval = minimumSyncIntervalMinutes;
      setAutoSyncInterval(minimumSyncIntervalMinutes.toString());
    }

    updateStoreProfile({
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
      updateStoreProfile({ logo_url: base64 });
      toast.success("Logo updated successfully");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLocalLogo("");
    updateStoreProfile({ logo_url: "" });
    toast.success("Logo removed");
  };

  const handleSwitchVertical = (type: StoreType) => {
    updateStoreProfile({ store_type: type });
    toast.success(`Switched to ${type.charAt(0).toUpperCase() + type.slice(1)} mode`);
  };

  const tauriTop = isTauri() ? 40 : 0;
  const headerHeight = 64;
  const stickyTop = tauriTop + headerHeight;

  return {
    storeProfile,
    user,
    theme,
    setTheme,
    isAdmin,
    isCloudLinked,
    storeType,
    activeTheme,
    setAppTheme,
    activeTab,
    setActiveTab,
    handleTabChange,
    isDesktop,
    stickyTop,
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
