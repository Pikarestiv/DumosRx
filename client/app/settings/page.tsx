"use client";

import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Store,
  Bell,
  Shield,
  Database,
  Palette,
  Globe,
  Users,
} from "lucide-react";
import { CloudLinkDialog } from "@/components/settings/cloud-link-dialog";
import { StaffManagement } from "@/components/settings/staff-management";

import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { StoreSettings } from "@/components/settings/store-settings";
import { AlertSettings } from "@/components/settings/alert-settings";
import { DataSettings } from "@/components/settings/data-settings";
import { SecuritySettings } from "@/components/settings/security-settings";
import { SystemSettings } from "@/components/settings/system-settings";
import { useSettings } from "@/hooks/use-settings";

export default function SettingsPage() {
  const {
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
    handleSaveProfile,
    handleSaveRegional,
    handleSaveReceiptSettings,
    handleSaveAlertSettings,
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
  } = useSettings();

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
          className="flex flex-col md:flex-row gap-6 md:gap-8 md:items-start relative"
        >
          <aside
            className="w-full md:w-48 flex-shrink-0 md:sticky z-30"
            style={{ top: isDesktop ? `${stickyTop + 16}px` : undefined }}
          >
            <TabsList
              className="flex flex-row md:flex-col h-auto bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b md:border-none p-2 md:p-0 gap-1 overflow-x-auto md:overflow-x-visible justify-start md:w-full sticky md:relative z-30 -mx-6 md:mx-0 px-6 md:px-0"
              style={{ top: !isDesktop ? `${stickyTop}px` : undefined }}
            >
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
            <TabsContent value="appearance">
              <AppearanceSettings
                theme={theme}
                setTheme={setTheme}
                activeTheme={activeTheme}
                setAppTheme={setAppTheme}
                localCurrency={localCurrency}
                setLocalCurrency={setLocalCurrency}
                localVat={localVat}
                setLocalVat={setLocalVat}
                handleSaveRegional={handleSaveRegional}
              />
            </TabsContent>

            <TabsContent value="store">
              <StoreSettings
                storeType={storeType}
                handleSwitchVertical={handleSwitchVertical}
                localName={localName}
                setLocalName={setLocalName}
                localAddress={localAddress}
                setLocalAddress={setLocalAddress}
                localPhone={localPhone}
                setLocalPhone={setLocalPhone}
                localEmail={localEmail}
                setLocalEmail={setLocalEmail}
                localPcn={localPcn}
                setLocalPcn={setLocalPcn}
                handleSaveProfile={handleSaveProfile}
                localLogo={localLogo}
                handleLogoUpload={handleLogoUpload}
                handleRemoveLogo={handleRemoveLogo}
                localReceiptHeader={localReceiptHeader}
                setLocalReceiptHeader={setLocalReceiptHeader}
                localReceiptFooter={localReceiptFooter}
                setLocalReceiptFooter={setLocalReceiptFooter}
                showLogo={showLogo}
                setShowLogo={setShowLogo}
                showContact={showContact}
                setShowContact={setShowContact}
                handleSaveReceiptSettings={handleSaveReceiptSettings}
              />
            </TabsContent>

            <TabsContent value="notifications">
              <AlertSettings
                lowStockAlert={lowStockAlert}
                setLowStockAlert={setLowStockAlert}
                expiryAlert={expiryAlert}
                setExpiryAlert={setExpiryAlert}
                expiryDays={expiryDays}
                setExpiryDays={setExpiryDays}
                handleSaveAlertSettings={handleSaveAlertSettings}
              />
            </TabsContent>

            <TabsContent value="data">
              <DataSettings
                isCloudLinked={isCloudLinked}
                handleSync={handleSync}
                setIsCloudLinkOpen={setIsCloudLinkOpen}
                handleDownloadBackup={handleDownloadBackup}
                handleRestoreBackup={handleRestoreBackup}
                handleResetDatabase={handleResetDatabase}
              />
            </TabsContent>

            <TabsContent value="security">
              <SecuritySettings
                currentPin={currentPin}
                setCurrentPin={setCurrentPin}
                newPin={newPin}
                setNewPin={setNewPin}
                confirmPin={confirmPin}
                setConfirmPin={setConfirmPin}
                handleUpdateSecurity={handleUpdateSecurity}
              />
            </TabsContent>

            {isAdmin && (
              <TabsContent value="staff">
                <StaffManagement />
              </TabsContent>
            )}

            <TabsContent value="system">
              <SystemSettings
                handleCheckForUpdates={handleCheckForUpdates}
                isCheckingUpdate={isCheckingUpdate}
                isUpdating={isUpdating}
                updateAvailable={updateAvailable}
                handleInstallUpdate={handleInstallUpdate}
              />
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
