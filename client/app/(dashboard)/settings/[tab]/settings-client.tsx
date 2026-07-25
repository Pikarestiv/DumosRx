"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Store,
  Bell,
  Shield,
  Database,
  Palette,
  Globe,
  Users,
  ChevronLeft,
} from "lucide-react";
import { CloudLinkDialog } from "@/components/settings/cloud-link-dialog";
import { StaffManagement } from "@/components/settings/staff-management";
import { SettingsMobileMenu } from "@/components/settings/settings-mobile-menu";
import Link from "next/link";

import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { StoreSettings } from "@/components/settings/store-settings";
import { AlertSettings } from "@/components/settings/alert-settings";
import { DataSettings } from "@/components/settings/data-settings";
import { SecuritySettings } from "@/components/settings/security-settings";
import { UserProfileBadge } from "@/components/dashboard/user-profile-badge";
import { SystemSettings } from "@/components/settings/system-settings";
import { useSettings } from "@/hooks/use-settings";

export default function SettingsPage({ isIndex }: { isIndex?: boolean }) {
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
    syncAfterLink,
    setSyncAfterLink,
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
    hidePoweredBy,
    setHidePoweredBy,
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

  if (!isDesktop && isIndex) {
    return <SettingsMobileMenu isAdmin={isAdmin} />;
  }

  return (
    <>
      <div className="max-w-5xl">
        {!isDesktop && !isIndex && (
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border/50">
            <Link
              href="/settings"
              className="w-10 h-10 rounded-xl bg-accent/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div className="text-lg font-semibold capitalize">
              {activeTab === "appearance"
                ? "General"
                : activeTab === "notifications"
                  ? "Alerts"
                  : activeTab}
            </div>
          </div>
        )}

        <div className="mb-6 hidden md:flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <UserProfileBadge />
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
              className="hidden md:flex flex-col h-auto overflow-x-auto scrollbar-none md:overflow-visible bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b md:border-none p-2 md:p-0 gap-1 justify-start md:w-full sticky md:relative z-30"
              style={{ top: !isDesktop ? `${stickyTop}px` : undefined }}
            >
              <TabsTrigger
                value="appearance"
                className="flex-none !justify-start w-full px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm border border-transparent rounded-lg"
              >
                <Palette className="w-4 h-4 mr-2 md:mr-3" />
                <span className="text-sm">General</span>
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger
                  value="store"
                  className="flex-none !justify-start w-full px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm border border-transparent rounded-lg"
                >
                  <Store className="w-4 h-4 mr-2 md:mr-3" />
                  <span className="text-sm">Store Profile</span>
                </TabsTrigger>
              )}
              <TabsTrigger
                value="notifications"
                className="flex-none !justify-start w-full px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm border border-transparent rounded-lg"
              >
                <Bell className="w-4 h-4 mr-2 md:mr-3" />
                <span className="text-sm">Alerts</span>
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger
                  value="data"
                  className="flex-none !justify-start w-full px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm border border-transparent rounded-lg"
                >
                  <Database className="w-4 h-4 mr-2 md:mr-3" />
                  <span className="text-sm">Data & Sync</span>
                </TabsTrigger>
              )}
              <TabsTrigger
                value="security"
                className="flex-none !justify-start w-full px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm border border-transparent rounded-lg"
              >
                <Shield className="w-4 h-4 mr-2 md:mr-3" />
                <span className="text-sm">Security</span>
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger
                  value="staff"
                  className="flex-none !justify-start w-full px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm border border-transparent rounded-lg"
                >
                  <Users className="w-4 h-4 mr-2 md:mr-3" />
                  <span className="text-sm">Staff</span>
                </TabsTrigger>
              )}
              {isAdmin && (
                <TabsTrigger
                  value="system"
                  className="flex-none !justify-start w-full px-3 md:px-4 py-3 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm border border-transparent rounded-lg"
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
                  hidePoweredBy={hidePoweredBy}
                  setHidePoweredBy={setHidePoweredBy}
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
                  setSyncAfterLink={setSyncAfterLink}
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
        onSuccess={() => {
          if (syncAfterLink) {
            handleSync(true);
          }
        }}
      />
    </>
  );
}
