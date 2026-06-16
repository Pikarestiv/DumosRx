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
    user,
    theme,
    setTheme,
    isAdmin,
    isCloudLinked,
    storeType,
    activeTheme,
    setAppTheme,
    activeTab,
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
  } = useSettings();

  console.log("[DEBUG SETTINGS]", { user, isAdmin });

  return (
    <DashboardLayout>
      <div className="max-w-5xl">
        <div className="mb-6 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h1 className="font-serif font-bold text-3xl text-foreground">
              Settings
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage your {storeType} configuration and preferences
            </p>
          </div>
          {user && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="font-medium text-foreground">{user.first_name || user.username}</span>
              <span className="text-muted-foreground bg-background/50 px-2 py-0.5 rounded-md text-xs border">
                {user.role.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
              </span>
            </div>
          )}
        </div>

        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          orientation="vertical"
          className="flex flex-col md:flex-row gap-6 md:gap-8 md:items-start relative"
        >
          <aside
            className="w-full md:w-48 flex-shrink-0 md:sticky z-30"
            style={{ top: isDesktop ? `${stickyTop + 16}px` : undefined }}
          >
            <TabsList
              className="flex flex-row flex-wrap md:flex-col h-auto bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b md:border-none p-2 md:p-0 gap-1 justify-start md:w-full sticky md:relative z-30"
              style={{ top: !isDesktop ? `${stickyTop}px` : undefined }}
            >
              <TabsTrigger
                value="appearance"
                className="flex-auto md:w-full justify-center md:justify-start px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20"
              >
                <Palette className="w-4 h-4 mr-2 md:mr-3" />
                <span className="text-sm">General</span>
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger
                  value="store"
                  className="flex-auto md:w-full justify-center md:justify-start px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20"
                >
                  <Store className="w-4 h-4 mr-2 md:mr-3" />
                  <span className="text-sm">Store Profile</span>
                </TabsTrigger>
              )}
              <TabsTrigger
                value="notifications"
                className="flex-auto md:w-full justify-center md:justify-start px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20"
              >
                <Bell className="w-4 h-4 mr-2 md:mr-3" />
                <span className="text-sm">Alerts</span>
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger
                  value="data"
                  className="flex-auto md:w-full justify-center md:justify-start px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20"
                >
                  <Database className="w-4 h-4 mr-2 md:mr-3" />
                  <span className="text-sm">Data & Sync</span>
                </TabsTrigger>
              )}
              <TabsTrigger
                value="security"
                className="flex-auto md:w-full justify-center md:justify-start px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20"
              >
                <Shield className="w-4 h-4 mr-2 md:mr-3" />
                <span className="text-sm">Security</span>
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger
                  value="staff"
                  className="flex-auto md:w-full justify-center md:justify-start px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20"
                >
                  <Users className="w-4 h-4 mr-2 md:mr-3" />
                  <span className="text-sm">Staff</span>
                </TabsTrigger>
              )}
              {isAdmin && (
                <TabsTrigger
                  value="system"
                  className="flex-auto md:w-full justify-center md:justify-start px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20"
                >
                  <Globe className="w-4 h-4 mr-2 md:mr-3" />
                  <span className="text-sm">System</span>
                </TabsTrigger>
              )}
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
                isAdmin={isAdmin}
              />
            </TabsContent>

            {isAdmin && (
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
                  localStoreSlug={localStoreSlug}
                  setLocalStoreSlug={setLocalStoreSlug}
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
                  showRetailSuggestions={showRetailSuggestions}
                  setShowRetailSuggestions={setShowRetailSuggestions}
                  requirePaymentAccount={requirePaymentAccount}
                  setRequirePaymentAccount={setRequirePaymentAccount}
                  enabledPaymentMethods={enabledPaymentMethods}
                  setEnabledPaymentMethods={setEnabledPaymentMethods}
                />
              </TabsContent>
            )}

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

            {isAdmin && (
              <TabsContent value="data">
                <DataSettings
                  isCloudLinked={isCloudLinked}
                  autoSyncEnabled={autoSyncEnabled}
                  setAutoSyncEnabled={setAutoSyncEnabled}
                  autoSyncInterval={autoSyncInterval}
                  setAutoSyncInterval={setAutoSyncInterval}
                  handleSaveAutoSyncSettings={handleSaveAutoSyncSettings}
                  handleSync={handleSync}
                  handleDownloadBackup={handleDownloadBackup}
                  handleRestoreBackup={handleRestoreBackup}
                  handleResetDatabase={handleResetDatabase}
                  setIsCloudLinkOpen={setIsCloudLinkOpen}
                />
              </TabsContent>
            )}

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

            {isAdmin && (
              <TabsContent value="system">
                <SystemSettings />
              </TabsContent>
            )}
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
