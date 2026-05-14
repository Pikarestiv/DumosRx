"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Moon,
  Sun,
  Store,
  Bell,
  Shield,
  Database,
  Palette,
  Globe,
  Save,
  Users,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";

import { useStore, StoreType } from "@/lib/context/store-context";
import { toast } from "sonner";
import {
  Pill,
  ShoppingBasket,
  ShoppingCart,
  Check,
  Upload,
} from "lucide-react";
import { APP_NAME, APP_VERSION } from "@/lib/constants";
import { useAuth } from "@/lib/context/auth-context";
import {
  getDatabaseBinary,
  restoreDatabase,
  resetDatabase,
} from "@/lib/db/core";
import { sync } from "@/lib/db/sync-engine";
import { CloudLinkDialog } from "@/components/settings/cloud-link-dialog";
import { CloudOff, RefreshCw, Download, Info } from "lucide-react";
import { isTauri } from "@/lib/db/core";
import { StaffManagement } from "@/components/settings/staff-management";

// Color themes from ThemeCustomizer
const colorThemes = [
  { name: "Professional", primary: "#1f2937", accent: "#8b5cf6" },
  { name: "Medical Blue", primary: "#1e40af", accent: "#3b82f6" },
  { name: "Forest Green", primary: "#166534", accent: "#22c55e" },
  { name: "Warm Orange", primary: "#ea580c", accent: "#f97316" },
  { name: "Deep Purple", primary: "#7c3aed", accent: "#a855f7" },
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { user, logout, isAdmin, changePin, isCloudLinked } = useAuth();

  const [isCloudLinkOpen, setIsCloudLinkOpen] = useState(false);
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState("appearance");

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const [updateAvailable, setUpdateAvailable] = useState<any>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const {
    storeProfile,
    storeType,
    updateStoreProfile,
    theme: activeTheme,
    setTheme: setAppTheme,
  } = useStore();

  // Local state for profile form
  const [localName, setLocalName] = useState(storeProfile?.name || "");
  const [localAddress, setLocalAddress] = useState(storeProfile?.address || "");
  const [localPhone, setLocalPhone] = useState(storeProfile?.phone || "");
  const [localEmail, setLocalEmail] = useState(storeProfile?.email || "");
  const [localCurrency, setLocalCurrency] = useState(
    storeProfile?.currency || "NGN",
  );
  const [localVat, setLocalVat] = useState(
    storeProfile?.vat_percentage?.toString() || "7.5",
  );
  const [localPcn, setLocalPcn] = useState(storeProfile?.pcn_license || "");
  const [localReceiptHeader, setLocalReceiptHeader] = useState(
    storeProfile?.receipt_header || "",
  );
  const [localReceiptFooter, setLocalReceiptFooter] = useState(
    storeProfile?.receipt_footer || "",
  );
  const [showLogo, setShowLogo] = useState(
    storeProfile?.show_logo_on_receipt === 1,
  );
  const [showContact, setShowContact] = useState(
    storeProfile?.show_contact_on_receipt === 1,
  );
  const [lowStockAlert, setLowStockAlert] = useState(
    storeProfile?.low_stock_warning === 1,
  );
  const [expiryAlert, setExpiryAlert] = useState(
    storeProfile?.expiry_warning === 1,
  );
  const [expiryDays, setExpiryDays] = useState(
    storeProfile?.expiry_warning_days?.toString() || "90",
  );

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) {
      if (tab === "cloud" || tab === "data") {
        setActiveTab("data");
        if (tab === "cloud") {
          if (!isCloudLinked) {
            setIsCloudLinkOpen(true);
          } else {
            setIsCloudLinkOpen(false);
          }
        }
      } else if (
        ["appearance", "store", "notifications", "security", "staff"].includes(
          tab,
        )
      ) {
        setActiveTab(tab);
      }
    }
  }, [searchParams, isCloudLinked]);

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
    }
  }, [storeProfile]);

  const themes = [
    { id: "default", name: "Dumos Blue", color: "bg-blue-600" },
    { id: "ocean", name: "Ocean Breeze", color: "bg-cyan-500" },
    { id: "emerald", name: "Emerald Health", color: "bg-emerald-500" },
    { id: "ruby", name: "Ruby Retail", color: "bg-rose-600" },
    { id: "midnight", name: "Midnight Gold", color: "bg-slate-900" },
    { id: "slate", name: "Professional Slate", color: "bg-slate-500" },
  ];

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

  const handleSwitchVertical = (type: StoreType) => {
    updateStoreProfile({ store_type: type });
    toast.success(
      `Switched to ${type.charAt(0).toUpperCase() + type.slice(1)} mode`,
    );
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
      success: (data) =>
        `Sync complete! Pushed ${data.pushed}, Pulled ${data.pulled}`,
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

  const handleRestoreBackup = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
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
    if (
      window.confirm(
        "Are you sure you want to reset the database? This will delete all products, sales, and local data. Your login account will remain.",
      )
    ) {
      await resetDatabase();
      toast.success("Database reset successfully.");
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl">
        <div className="mb-6">
          <h1 className="font-serif font-bold text-3xl text-foreground">
            Settings
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your {storeType} configuration and preferences
          </p>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          orientation="vertical"
          className="flex flex-col md:flex-row gap-6 md:gap-8 md:items-start"
        >
          <aside className="w-full md:w-48 flex-shrink-0">
            <TabsList className="flex flex-row md:flex-col h-auto bg-transparent border-none p-0 gap-1 overflow-x-auto md:overflow-x-visible justify-start md:w-full">
              <TabsTrigger
                value="appearance"
                className="flex-1 md:w-full justify-center md:justify-start px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20"
              >
                <Palette className="w-4 h-4 md:mr-3" />
                <span className="hidden md:inline text-sm">General</span>
              </TabsTrigger>
              <TabsTrigger
                value="store"
                className="flex-1 md:w-full justify-center md:justify-start px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20"
              >
                <Store className="w-4 h-4 md:mr-3" />
                <span className="hidden md:inline text-sm">Store Profile</span>
              </TabsTrigger>
              <TabsTrigger
                value="notifications"
                className="flex-1 md:w-full justify-center md:justify-start px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20"
              >
                <Bell className="w-4 h-4 md:mr-3" />
                <span className="hidden md:inline text-sm">Alerts</span>
              </TabsTrigger>
              <TabsTrigger
                value="data"
                className="flex-1 md:w-full justify-center md:justify-start px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20"
              >
                <Database className="w-4 h-4 md:mr-3" />
                <span className="hidden md:inline text-sm">Data & Sync</span>
              </TabsTrigger>
              <TabsTrigger
                value="security"
                className="flex-1 md:w-full justify-center md:justify-start px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20"
              >
                <Shield className="w-4 h-4 md:mr-3" />
                <span className="hidden md:inline text-sm">Security</span>
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger
                  value="staff"
                  className="flex-1 md:w-full justify-center md:justify-start px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20"
                >
                  <Users className="w-4 h-4 md:mr-3" />
                  <span className="hidden md:inline text-sm">Staff</span>
                </TabsTrigger>
              )}
              <TabsTrigger
                value="system"
                className="flex-1 md:w-full justify-center md:justify-start px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20"
              >
                <Globe className="w-4 h-4 md:mr-3" />
                <span className="hidden md:inline text-sm">System</span>
              </TabsTrigger>
            </TabsList>
          </aside>

          <div className="flex-1 min-w-0">
            {/* APPEARANCE & GENERAL */}
            <TabsContent value="appearance" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Appearance</CardTitle>
                  <CardDescription>
                    Customize how {APP_NAME} looks on this device.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <Label>Theme Mode</Label>
                    <div className="grid grid-cols-3 gap-4">
                      <button
                        onClick={() => setTheme("light")}
                        className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all cursor-pointer ${
                          theme === "light"
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-primary/50"
                        }`}
                      >
                        <Sun className="h-6 w-6 mb-2" />
                        <span className="text-sm font-medium">Light</span>
                      </button>
                      <button
                        onClick={() => setTheme("dark")}
                        className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all cursor-pointer ${
                          theme === "dark"
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-primary/50"
                        }`}
                      >
                        <Moon className="h-6 w-6 mb-2" />
                        <span className="text-sm font-medium">Dark</span>
                      </button>
                      <button
                        onClick={() => setTheme("system")}
                        className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all cursor-pointer ${
                          theme === "system"
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-primary/50"
                        }`}
                      >
                        <Globe className="h-6 w-6 mb-2" />
                        <span className="text-sm font-medium">System</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label>Color Themes</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {themes.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setAppTheme(t.id)}
                          className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all cursor-pointer ${
                            activeTheme === t.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted"
                          }`}
                        >
                          <div
                            className={`w-6 h-6 rounded-full ${t.color} border shadow-sm`}
                          />
                          <span className="text-sm font-medium">{t.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Regional Settings</CardTitle>
                  <CardDescription>
                    Configure currency and locale defaults.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="currency">Currency Code (ISO)</Label>
                    <Input
                      id="currency"
                      value={localCurrency}
                      onChange={(e) =>
                        setLocalCurrency(e.target.value.toUpperCase())
                      }
                      placeholder="e.g. NGN, USD, GHS"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="vat">VAT Percentage (%)</Label>
                    <Input
                      id="vat"
                      type="number"
                      step="0.1"
                      value={localVat}
                      onChange={(e) => setLocalVat(e.target.value)}
                      placeholder="e.g. 7.5"
                    />
                  </div>
                </CardContent>
                <CardFooter className="border-t px-6 py-4">
                  <Button onClick={handleSaveRegional}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Regional Settings
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            {/* STORE DETAILS */}
            <TabsContent value="store" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Business Vertical</CardTitle>
                  <CardDescription>
                    Switching modes changes the terminology and active modules.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { id: "pharmacy", label: "Pharmacy", icon: Pill },
                      { id: "grocery", label: "Grocery", icon: ShoppingBasket },
                      {
                        id: "supermarket",
                        label: "Supermarket",
                        icon: ShoppingCart,
                      },
                      { id: "general", label: "General", icon: Check },
                    ].map((vertical) => (
                      <button
                        key={vertical.id}
                        onClick={() =>
                          handleSwitchVertical(vertical.id as StoreType)
                        }
                        className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all cursor-pointer ${
                          storeType === vertical.id
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-primary/50"
                        }`}
                      >
                        <vertical.icon className="h-6 w-6 mb-2 text-primary" />
                        <span className="text-sm font-medium">
                          {vertical.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Store Information</CardTitle>
                  <CardDescription>
                    These details will appear on printed receipts and reports.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="store-name">Business Name</Label>
                    <Input
                      id="store-name"
                      placeholder="e.g. My Business"
                      value={localName}
                      onChange={(e) => setLocalName(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      placeholder="123 Health Avenue, Lagos"
                      value={localAddress}
                      onChange={(e) => setLocalAddress(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        placeholder="+234..."
                        value={localPhone}
                        onChange={(e) => setLocalPhone(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        placeholder="contact@example.com"
                        value={localEmail}
                        onChange={(e) => setLocalEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  {storeType === "pharmacy" && (
                    <div className="grid gap-2">
                      <Label htmlFor="pcn">PCN License Number</Label>
                      <Input
                        id="pcn"
                        placeholder="PCN/..."
                        value={localPcn}
                        onChange={(e) => setLocalPcn(e.target.value)}
                      />
                    </div>
                  )}
                </CardContent>
                <CardFooter className="border-t px-6 py-4">
                  <Button
                    onClick={handleSaveProfile}
                    className="cursor-pointer"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </Button>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Receipt Customization</CardTitle>
                  <CardDescription>
                    Configure how your printed receipts look.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="receipt-header">
                      Receipt Header (Optional)
                    </Label>
                    <Input
                      id="receipt-header"
                      placeholder="e.g. Thanks for your patronage!"
                      value={localReceiptHeader}
                      onChange={(e) => setLocalReceiptHeader(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="receipt-footer">Receipt Footer</Label>
                    <Input
                      id="receipt-footer"
                      placeholder="e.g. No refund after 24 hours"
                      value={localReceiptFooter}
                      onChange={(e) => setLocalReceiptFooter(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label className="text-base">Show Logo on Receipt</Label>
                      <p className="text-sm text-muted-foreground">
                        Display store logo at the top
                      </p>
                    </div>
                    <Switch checked={showLogo} onCheckedChange={setShowLogo} />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label className="text-base">Show Phone & Address</Label>
                      <p className="text-sm text-muted-foreground">
                        Include contact details on receipt
                      </p>
                    </div>
                    <Switch
                      checked={showContact}
                      onCheckedChange={setShowContact}
                    />
                  </div>
                </CardContent>
                <CardFooter className="border-t px-6 py-4">
                  <Button
                    onClick={handleSaveReceiptSettings}
                    className="cursor-pointer"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Receipt Settings
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            {/* NOTIFICATIONS */}
            <TabsContent value="notifications">
              <Card>
                <CardHeader>
                  <CardTitle>Inventory Alerts</CardTitle>
                  <CardDescription>
                    Configure when you want to be warned about stock issues.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label className="text-base">Low Stock Warning</Label>
                      <p className="text-sm text-muted-foreground">
                        Notify when stock hits reorder level
                      </p>
                    </div>
                    <Switch
                      checked={lowStockAlert}
                      onCheckedChange={setLowStockAlert}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label className="text-base">Expiry Warning</Label>
                      <p className="text-sm text-muted-foreground">
                        Notify before medicines expire
                      </p>
                    </div>
                    <Switch
                      checked={expiryAlert}
                      onCheckedChange={setExpiryAlert}
                    />
                  </div>
                  <div className="grid gap-2 pt-4">
                    <Label>Days before expiry to warn</Label>
                    <Input
                      type="number"
                      value={expiryDays}
                      onChange={(e) => setExpiryDays(e.target.value)}
                      className="max-w-[150px]"
                    />
                  </div>
                </CardContent>
                <CardFooter className="border-t px-6 py-4">
                  <Button
                    onClick={handleSaveAlertSettings}
                    className="cursor-pointer"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Alert Preferences
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            {/* DATA & SYNC */}
            <TabsContent value="data">
              <Card>
                <CardHeader>
                  <CardTitle>Data Synchronization</CardTitle>
                  <CardDescription>
                    Manage offline data and cloud backups.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 border rounded-lg bg-muted/30 gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-10 w-10 ${isCloudLinked ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"} rounded-full flex items-center justify-center`}
                      >
                        {isCloudLinked ? (
                          <Database className="h-5 w-5" />
                        ) : (
                          <CloudOff className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">
                          {isCloudLinked
                            ? "Connected to Cloud"
                            : "Local Mode (Not Linked)"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {isCloudLinked
                            ? `Last synced: ${localStorage.getItem("last_sync_time") ? new Date(localStorage.getItem("last_sync_time")!).toLocaleString() : "Never"}`
                            : "Connect your cloud account to enable sync"}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {!isCloudLinked && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsCloudLinkOpen(true)}
                        >
                          Link Account
                        </Button>
                      )}
                      <Button
                        variant={isCloudLinked ? "outline" : "default"}
                        size="sm"
                        onClick={handleSync}
                      >
                        {isCloudLinked ? "Sync Now" : "Link & Sync"}
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h3 className="font-medium">Backup & Restore</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Button
                        variant="outline"
                        className="w-full justify-start cursor-pointer"
                        onClick={handleDownloadBackup}
                      >
                        <Save className="w-4 h-4 mr-2" />
                        Download Local Backup
                      </Button>
                      <div className="relative">
                        <Button
                          variant="outline"
                          className="w-full justify-start cursor-pointer"
                          asChild
                        >
                          <label htmlFor="restore-db">
                            <Upload className="w-4 h-4 mr-2" />
                            Restore from File
                          </label>
                        </Button>
                        <input
                          type="file"
                          id="restore-db"
                          className="hidden"
                          accept=".drx"
                          onChange={handleRestoreBackup}
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h3 className="font-medium text-destructive">
                      Danger Zone
                    </h3>
                    <div className="p-4 border border-destructive/20 rounded-lg bg-destructive/5 flex flex-col md:flex-row items-center justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">Factory Reset</p>
                        <p className="text-xs text-muted-foreground">
                          Wipe all local data (medicines, sales, etc.) and start
                          fresh.
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleResetDatabase}
                      >
                        Reset All Data
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* SECURITY */}
            <TabsContent value="security">
              <Card>
                <CardHeader>
                  <CardTitle>Security Settings</CardTitle>
                  <CardDescription>
                    Protect your account and session.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label>Current PIN</Label>
                    <Input
                      type="password"
                      value={currentPin}
                      onChange={(e) => setCurrentPin(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>New PIN</Label>
                    <Input
                      type="password"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Confirm New PIN</Label>
                    <Input
                      type="password"
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value)}
                    />
                  </div>
                  <Separator className="my-4" />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">Auto-Lock Screen</Label>
                      <p className="text-sm text-muted-foreground">
                        Lock dashboard after 5 minutes of inactivity
                      </p>
                    </div>
                    <Switch />
                  </div>
                </CardContent>
                <CardFooter className="border-t px-6 py-4">
                  <Button onClick={handleUpdateSecurity}>
                    Update Security
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            {/* STAFF MANAGEMENT */}
            {isAdmin && (
              <TabsContent value="staff">
                <StaffManagement />
              </TabsContent>
            )}
            <TabsContent value="system" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>System Updates</CardTitle>
                  <CardDescription>
                    Manage application updates and system information
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Application Version</Label>
                      <p className="text-sm text-muted-foreground">
                        Current version: {APP_VERSION}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleCheckForUpdates}
                      disabled={isCheckingUpdate || isUpdating}
                    >
                      <RefreshCw
                        className={`w-4 h-4 mr-2 ${isCheckingUpdate ? "animate-spin" : ""}`}
                      />
                      {isCheckingUpdate ? "Checking..." : "Check for Updates"}
                    </Button>
                  </div>

                  {updateAvailable && (
                    <div className="p-4 border rounded-lg bg-primary/5 border-primary/20 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-full bg-primary/10 text-primary">
                          <Info className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-semibold text-primary">
                            New Update Available!
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            Version {updateAvailable.version} is now available.
                            This update includes new features and bug fixes.
                          </p>
                        </div>
                      </div>
                      <Button
                        className="w-full"
                        onClick={handleInstallUpdate}
                        disabled={isUpdating}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        {isUpdating
                          ? "Installing..."
                          : `Install Version ${updateAvailable.version}`}
                      </Button>
                    </div>
                  )}

                  <Separator />

                  <div className="space-y-2">
                    <Label>System Information</Label>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="space-y-1">
                        <p className="text-muted-foreground">Environment</p>
                        <p className="font-medium">
                          {isTauri() ? "Desktop (Tauri)" : "Web Browser"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-muted-foreground">Platform</p>
                        <p className="font-medium">
                          {typeof window !== "undefined"
                            ? navigator.userAgent.includes("Mac")
                              ? "MacOS"
                              : navigator.userAgent.includes("Win")
                                ? "Windows"
                                : "Linux"
                            : "Unknown"}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>About {APP_NAME}</CardTitle>
                  <CardDescription>
                    Software information and licensing
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p>
                    DumosRx is a professional pharmacy management system
                    designed to streamline operations, track inventory, and
                    manage sales with ease.
                  </p>
                  <p className="mt-4">
                    © 2019 - {new Date().getFullYear()} {APP_NAME}. All rights
                    reserved.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <CloudLinkDialog
        open={isCloudLinkOpen}
        onOpenChange={setIsCloudLinkOpen}
        onSuccess={handleSync}
      />
    </DashboardLayout>
  );
}
