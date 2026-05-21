"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
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

export function useSettings() {
  const { theme, setTheme } = useTheme();
  const { isAdmin, changePin, isCloudLinked } = useAuth();
  const {
    storeProfile,
    storeType,
    updateStoreProfile,
    theme: activeTheme,
    setTheme: setAppTheme,
  } = useStore();

  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState("appearance");
  const [isCloudLinkOpen, setIsCloudLinkOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  // Security State
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  // Update State
  const [updateAvailable, setUpdateAvailable] = useState<any>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Form States
  const [localName, setLocalName] = useState(storeProfile?.name || "");
  const [localAddress, setLocalAddress] = useState(storeProfile?.address || "");
  const [localPhone, setLocalPhone] = useState(storeProfile?.phone || "");
  const [localEmail, setLocalEmail] = useState(storeProfile?.email || "");
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
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(storeProfile?.auto_sync_enabled === 1);
  const [autoSyncInterval, setAutoSyncInterval] = useState(storeProfile?.auto_sync_interval?.toString() || "15");

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
      setAutoSyncEnabled(storeProfile.auto_sync_enabled === 1);
      setAutoSyncInterval(storeProfile.auto_sync_interval?.toString() || "15");
    }
  }, [storeProfile]);

  // Tab activation from URL
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) {
      if (tab === "cloud" || tab === "data") {
        setActiveTab("data");
        if (tab === "cloud" && !isCloudLinked) setIsCloudLinkOpen(true);
      } else if (["appearance", "store", "notifications", "security", "staff", "system"].includes(tab)) {
        setActiveTab(tab);
      }
    }
  }, [searchParams, isCloudLinked]);

  // Handlers
  const handleSaveProfile = () => {
    updateStoreProfile({
      name: localName,
      address: localAddress,
      phone: localPhone,
      email: localEmail,
      pcn_license: localPcn,
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
    updateStoreProfile({
      auto_sync_enabled: autoSyncEnabled ? 1 : 0,
      auto_sync_interval: parseInt(autoSyncInterval) || 15,
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
      return;
    }
    if (newPin !== confirmPin) {
      toast.error("New PINs do not match");
      return;
    }
    const result = await changePin(currentPin, newPin);
    if (result.success) {
      toast.success(result.message);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } else {
      toast.error(result.message);
    }
  };

  const handleSync = async () => {
    if (!isCloudLinked) {
      setIsCloudLinkOpen(true);
      return;
    }
    toast.promise(sync(), {
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
    link.download = `${APP_NAME.toLowerCase()}_backup_${new Date().toISOString().split("T")[0]}.drx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Backup downloaded successfully");
  };

  const handleCheckForUpdates = async () => {
    if (!isTauri()) {
      toast.info("Updates are only available in the desktop application");
      return;
    }
    setIsCheckingUpdate(true);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        setUpdateAvailable(update);
        toast.success(`New version available: ${update.version}`);
      } else {
        setUpdateAvailable(null);
        toast.info("You are on the latest version");
      }
    } catch (err) {
      console.error("Failed to check for updates:", err);
      toast.error("Failed to check for updates");
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleInstallUpdate = async () => {
    if (!updateAvailable) return;
    setIsUpdating(true);
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      toast.info("Downloading and installing update...");
      await updateAvailable.downloadAndInstall();
      toast.success("Update installed! Restarting...");
      await relaunch();
    } catch (err) {
      console.error("Failed to install update:", err);
      toast.error("Failed to install update");
      setIsUpdating(false);
    }
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
    if (window.confirm("Are you sure you want to reset the database? This will delete all products, sales, and local data. Your login account will remain.")) {
      await resetDatabase();
      toast.success("Database reset successfully.");
    }
  };

  const tauriTop = isTauri() ? 40 : 0;
  const headerHeight = 64;
  const stickyTop = tauriTop + headerHeight;

  return {
    theme,
    setTheme,
    isAdmin,
    isCloudLinked,
    storeType,
    activeTheme,
    setAppTheme,
    activeTab,
    setActiveTab,
    isCloudLinkOpen,
    setIsCloudLinkOpen,
    isDesktop,
    currentPin,
    setCurrentPin,
    newPin,
    setNewPin,
    confirmPin,
    setConfirmPin,
    updateAvailable,
    isCheckingUpdate,
    isUpdating,
    localName,
    setLocalName,
    localAddress,
    setLocalAddress,
    localPhone,
    setLocalPhone,
    localEmail,
    setLocalEmail,
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
    handleCheckForUpdates,
    handleInstallUpdate,
    handleRestoreBackup,
    handleResetDatabase,
    stickyTop,
  };
}
