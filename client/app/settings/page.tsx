"use client";

import { useState } from "react";
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
  Monitor,
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
  const [selectedColorTheme, setSelectedColorTheme] = useState(0);

  const applyColorTheme = (themeIndex: number) => {
    const colorTheme = colorThemes[themeIndex];
    const root = document.documentElement;
    root.style.setProperty("--primary", colorTheme.primary);
    root.style.setProperty("--accent", colorTheme.accent);
    setSelectedColorTheme(themeIndex);
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="font-serif font-bold text-3xl text-foreground">
            Settings
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your pharmacy configuration and preferences
          </p>
        </div>

        <Tabs defaultValue="appearance" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto">
            <TabsTrigger value="appearance" className="py-3">
              <Palette className="w-4 h-4 mr-2" />
              General
            </TabsTrigger>
            <TabsTrigger value="pharmacy" className="py-3">
              <Store className="w-4 h-4 mr-2" />
              Pharmacy
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
                  Customize how DumosRx looks on this device.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label>Theme Mode</Label>
                  <div className="grid grid-cols-3 gap-4">
                    <button
                      onClick={() => setTheme("light")}
                      className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${
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
                      className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${
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
                      className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${
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
                  <Label>Color Palette</Label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {colorThemes.map((t, index) => (
                      <button
                        key={t.name}
                        onClick={() => applyColorTheme(index)}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                          selectedColorTheme === index
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        <div className="flex gap-1">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: t.primary }}
                          />
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: t.accent }}
                          />
                        </div>
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
                  <Label htmlFor="currency">Currency Symbol</Label>
                  <Input
                    id="currency"
                    defaultValue="₦ (NGN)"
                    readOnly
                    className="bg-muted"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PHARMACY DETAILS */}
          <TabsContent value="pharmacy">
            <Card>
              <CardHeader>
                <CardTitle>Pharmacy Information</CardTitle>
                <CardDescription>
                  These details will appear on printed receipts and reports.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="store-name">Pharmacy Name</Label>
                  <Input
                    id="store-name"
                    placeholder="e.g. Dumos Pharmacy"
                    defaultValue="Dumos Pharmacy"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="address">Address</Label>
                  <Input id="address" placeholder="123 Health Avenue, Lagos" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input id="phone" placeholder="+234..." />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" placeholder="contact@dumos.com" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pcn">PCN License Number</Label>
                  <Input id="pcn" placeholder="PCN/..." />
                </div>
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button>
                  <Save className="w-4 h-4 mr-2" />
                  Save Details
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
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label className="text-base">Expiry Warning</Label>
                    <p className="text-sm text-muted-foreground">
                      Notify before medicines expire
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="grid gap-2 pt-4">
                  <Label>Days before expiry to warn</Label>
                  <Input
                    type="number"
                    defaultValue="90"
                    className="max-w-[150px]"
                  />
                </div>
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button>Save Preferences</Button>
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
                  <Label>Current Password</Label>
                  <Input type="password" />
                </div>
                <div className="grid gap-2">
                  <Label>New Password</Label>
                  <Input type="password" />
                </div>
                <div className="grid gap-2">
                  <Label>Confirm New Password</Label>
                  <Input type="password" />
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
                <Button>Update Security</Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
