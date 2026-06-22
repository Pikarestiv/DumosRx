"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter, useParams, usePathname } from "next/navigation";
import { useTheme } from "@/components/theme-provider";
import { useStore, StoreType } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { toast } from "sonner";
import { APP_NAME } from "@/lib/constants";
import {
  getDatabaseBinary,
  restoreDatabase,
  resetDatabase,
  isTauri,
} from "@/lib/db/core";
import { sync } from "@/lib/db/sync-engine";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { apiClient } from "@/lib/api/client";

export function useSettings() {
  const { theme, setTheme } = useTheme();
  const { user, isAdmin, changePin, isCloudLinked } = useAuth();
  const {
    storeProfile,
    storeType,
    updateStoreProfile,
    theme: activeTheme,
    setTheme: setAppTheme,
  } = useStore();

  const { minimumSyncIntervalMinutes } = useFeatureGate();

  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const tabParam = params?.tab as string;
  const [activeTab, setActiveTab] = useState(tabParam || "appearance");
  const [isCloudLinkOpen, setIsCloudLinkOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  // Security State
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  // Form States
  const [localName, setLocalName] = useState(storeProfile?.name || "");
  const [localAddress, setLocalAddress] = useState(storeProfile?.address || "");
  const [localPhone, setLocalPhone] = useState(storeProfile?.phone || "");
  const [localEmail, setLocalEmail] = useState(storeProfile?.email || "");
  const [localStoreSlug, setLocalStoreSlug] = useState(storeProfile?.store_slug || "");
  const [localCurrency, setLocalCurrency] = useState(storeProfile?.currency || "NGN");
  const [localVat, setLocalVat] = useState(storeProfile?.vat_percentage?.toString() || "7.5");
  const [localPcn, setLocalPcn] = useState(storeProfile?.pcn_license || "");
  const [localReceiptHeader, setLocalReceiptHeader] = useState(storeProfile?.receipt_header || "");
  const [localReceiptFooter, setLocalReceiptFooter] = useState(storeProfile?.receipt_footer || "");
  const [showLogo, setShowLogo] = useState(storeProfile?.show_logo_on_receipt === 1);
  const [showContact, setShowContact] = useState(storeProfile?.show_contact_on_receipt === 1);
  const [lowStockAlert, setLowStockAlert] = useState(storeProfile?.low_stock_warning === 1);
  const [expiryAlert, setExpiryAlert] = useState(storeProfile?.expiry_warning === 1);
  const [expiryDays, setExpiryDays] = useState(storeProfile?.expiry_warning_days?.toString() || "90");
  const [localLogo, setLocalLogo] = useState(storeProfile?.logo_url || "");
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(storeProfile?.auto_sync_enabled !== 0);
  const [autoSyncInterval, setAutoSyncInterval] = useState(storeProfile?.auto_sync_interval?.toString() || minimumSyncIntervalMinutes.toString());
  const [showRetailSuggestions, setShowRetailSuggestions] = useState(storeProfile?.show_retail_suggestions === 1);
  const [requirePaymentAccount, setRequirePaymentAccount] = useState(storeProfile?.require_payment_account === 1);
  const [enabledPaymentMethods, setEnabledPaymentMethods] = useState<string[]>(
    storeProfile?.enabled_payment_methods ? JSON.parse(storeProfile.enabled_payment_methods) : ["cash", "card", "transfer", "credit", "mixed"]
  );

  // Responsive Effect
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Sync state with storeProfile
  useEffect(() => {
    if (storeProfile) {
      setLocalName(storeProfile.name || "");
      setLocalAddress(storeProfile.address || "");
      setLocalPhone(storeProfile.phone || "");
      setLocalEmail(storeProfile.email || "");
      setLocalStoreSlug(storeProfile.store_slug || "");
      setLocalCurrency(storeProfile.currency || "NGN");
      setLocalVat(storeProfile.vat_percentage?.toString() || "7.5");
      setLocalPcn(storeProfile.pcn_license || "");
      setLocalReceiptHeader(storeProfile.receipt_header || "");
      setLocalReceiptFooter(storeProfile.receipt_footer || "");
      setShowLogo(storeProfile.show_logo_on_receipt === 1);
      setShowContact(storeProfile.show_contact_on_receipt === 1);
      setLowStockAlert(storeProfile.low_stock_warning === 1);
      setExpiryAlert(storeProfile.expiry_warning === 1);
      setExpiryDays(storeProfile.expiry_warning_days?.toString() || "90");
      setLocalLogo(storeProfile.logo_url || "");
      setAutoSyncEnabled(storeProfile.auto_sync_enabled !== 0);
      setShowRetailSuggestions(storeProfile.show_retail_suggestions === 1);
      setRequirePaymentAccount(storeProfile.require_payment_account === 1);
      try {
        setEnabledPaymentMethods(storeProfile.enabled_payment_methods ? JSON.parse(storeProfile.enabled_payment_methods) : ["cash", "card", "transfer", "credit", "mixed"]);
      } catch (e) {
        setEnabledPaymentMethods(["cash", "card", "transfer", "credit", "mixed"]);
      }
      
      let interval = storeProfile.auto_sync_interval || minimumSyncIntervalMinutes;
      if (interval < minimumSyncIntervalMinutes) {
        interval = minimumSyncIntervalMinutes;
      }
      setAutoSyncInterval(interval.toString());
    }
  }, [storeProfile, minimumSyncIntervalMinutes]);

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
          setIsCloudLinkOpen(true);
        }
      } else if (["appearance", "store", "notifications", "security", "staff", "system"].includes(internalTab)) {
        if (!isAdmin && ["store", "data", "staff", "system", "cloud"].includes(internalTab)) {
          // If non-admin tries to access restricted tab, force them to appearance
          setActiveTab("appearance");
          return;
        }
        if (activeTab !== internalTab) {
          setActiveTab(internalTab);
        }
      }
    }
  }, [tabParam, isCloudLinked, isAdmin, activeTab]);

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
    // Check slug uniqueness if it changed
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

  const handleUpdateSecurity = async () => {
    if (!currentPin || !newPin || !confirmPin) {
      toast.error("All fields are required");
      return false;
    }
    if (newPin !== confirmPin) {
      toast.error("New PINs do not match");
      return false;
    }
    const result = await changePin(currentPin, newPin);
    if (result.success) {
      toast.success(result.message);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      return true;
    } else {
      toast.error(result.message);
      return false;
    }
  };

  const handleSync = async () => {
    if (!isCloudLinked) {
      setIsCloudLinkOpen(true);
      return;
    }
    toast.promise(sync(true), {
      loading: "Synchronizing data with cloud...",
      success: (data) => `Sync complete! Pushed ${data.pushed}, Pulled ${data.pulled}`,
      error: "Sync failed. Please check your connection.",
    });
  };

  const handleDownloadBackup = () => {
    const binary = getDatabaseBinary();
    if (!binary) {
      toast.error("Failed to export database");
      return;
    }
    const blob = new Blob([binary as any], { type: "application/x-sqlite3" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toISOString().split("T")[1].slice(0, 8).replace(/:/g, "-");
    link.download = `${APP_NAME.toLowerCase()}_backup_${dateStr}_${timeStr}.drx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Backup downloaded successfully");
  };

  const handleRestoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = e.target?.result;
      if (result instanceof ArrayBuffer) {
        try {
          await restoreDatabase(new Uint8Array(result));
          toast.success("Database restored successfully. Page will reload.");
        } catch (err) {
          toast.error("Failed to restore database. Invalid file?");
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleResetDatabase = async () => {
    await resetDatabase();
    toast.success("Database reset successfully.");
  };

  const tauriTop = isTauri() ? 40 : 0;
  const headerHeight = 64;
  const stickyTop = tauriTop + headerHeight;

  return {
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
    isCloudLinkOpen,
    setIsCloudLinkOpen,
    isDesktop,
    currentPin,
    setCurrentPin,
    newPin,
    setNewPin,
    confirmPin,
    setConfirmPin,
    localName,
    setLocalName,
    localAddress,
    setLocalAddress,
    localPhone,
    setLocalPhone,
    localEmail,
    setLocalEmail,
    localStoreSlug,
    setLocalStoreSlug,
    localCurrency,
    setLocalCurrency,
    localVat,
    setLocalVat,
    localPcn,
    setLocalPcn,
    localReceiptHeader,
    setLocalReceiptHeader,
    localReceiptFooter,
    setLocalReceiptFooter,
    showLogo,
    setShowLogo,
    showContact,
    setShowContact,
    lowStockAlert,
    setLowStockAlert,
    expiryAlert,
    setExpiryAlert,
    expiryDays,
    setExpiryDays,
    localLogo,
    autoSyncEnabled,
    setAutoSyncEnabled,
    autoSyncInterval,
    setAutoSyncInterval,
    showRetailSuggestions,
    setShowRetailSuggestions,
    requirePaymentAccount,
    setRequirePaymentAccount,
    enabledPaymentMethods,
    setEnabledPaymentMethods,
    handleSaveProfile,
    handleSaveRegional,
    handleSaveReceiptSettings,
    handleSaveAlertSettings,
    handleSaveAutoSyncSettings,
    handleLogoUpload,
    handleRemoveLogo,
    handleSwitchVertical,
    handleUpdateSecurity,
    handleSync,
    handleDownloadBackup,
    handleRestoreBackup,
    handleResetDatabase,
    stickyTop,
  };
}
