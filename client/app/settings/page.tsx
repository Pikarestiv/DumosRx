"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";

import { useStore, StoreType } from "@/lib/context/store-context";
import { toast } from "sonner";
import { Pill, ShoppingBasket, ShoppingCart, Check } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { useAuth } from "@/lib/context/auth-context";

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
  const { user, logout, isAdmin, changePin } = useAuth();

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
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

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="font-serif font-bold text-3xl text-foreground">
            Settings
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your {storeType} configuration and preferences
          </p>
        </div>

        <Tabs defaultValue="appearance" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto">
            <TabsTrigger value="appearance" className="py-3">
              <Palette className="w-4 h-4 mr-2" />
              General
            </TabsTrigger>
            <TabsTrigger value="store" className="py-3">
              <Store className="w-4 h-4 mr-2" />
              Store Profile
            </TabsTrigger>
            <TabsTrigger value="notifications" className="py-3">
              <Bell className="w-4 h-4 mr-2" />
              Alerts
            </TabsTrigger>
            <TabsTrigger value="data" className="py-3">
              <Database className="w-4 h-4 mr-2" />
              Data & Sync
            </TabsTrigger>
            <TabsTrigger value="security" className="py-3">
              <Shield className="w-4 h-4 mr-2" />
              Security
            </TabsTrigger>
          </TabsList>

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
                <Button onClick={handleSaveProfile} className="cursor-pointer">
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
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                      <Database className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">Sync Status</p>
                      <p className="text-sm text-muted-foreground">
                        All data is up to date
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    Sync Now
                  </Button>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-medium">Backup & Restore</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Button variant="outline" className="w-full justify-start">
                      Download Local Backup
                    </Button>
                    <Button variant="outline" className="w-full justify-start">
                      Restore from File
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
                <Button onClick={handleUpdateSecurity}>Update Security</Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
