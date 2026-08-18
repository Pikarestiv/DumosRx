"use client";

import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ChevronLeft } from "lucide-react";
import { CloudLinkDialog } from "@/components/settings/cloud-link-dialog";
import { StaffManagement } from "@/components/settings/staff-management";
import { SettingsMobileMenu } from "@/components/settings/settings-mobile-menu";
import { SettingsTabNav } from "./settings-tab-nav";

import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { StoreSettings } from "@/components/settings/store-settings";
import { AlertSettings } from "@/components/settings/alert-settings";
import { DataSettings } from "@/components/settings/data-settings";
import { DemoDataSettings } from "@/components/settings/demo-data-settings";
import { SecuritySettings } from "@/components/settings/security-settings";
import { SystemSettings } from "@/components/settings/system-settings";
import { useSettings } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

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
    localRegistrationNumber,
    setLocalRegistrationNumber,
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
    onlineStoreEnabled,
    setOnlineStoreEnabled,
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
    handleRestoreBackupTauri,
    handleResetDatabase,
    isTauri,
  } = useSettings();
  const router = useRouter();

  console.log("[DEBUG SETTINGS]", { user, isAdmin });

  if (!isDesktop && isIndex) {
    return <SettingsMobileMenu isAdmin={isAdmin} />;
  }

  const TAB_LABELS: Record<string, string> = {
    appearance: "General",
    notifications: "Alerts",
  };

  return (
    <>
      <div className="max-w-5xl">
        {!isDesktop && !isIndex && (
          <div className="sticky top-0 z-20 bg-background flex items-center gap-3 px-4 py-4 border-border/50">
            <Button
              variant="outline"
              size="icon"
              className="md:hidden h-9 w-9 rounded-xl bg-muted/50 border-border/50 text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => router.push("/settings")}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>

            <div className="text-lg font-semibold capitalize">
              {TAB_LABELS[activeTab] ?? activeTab}
            </div>
          </div>
        )}

        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          orientation="vertical"
          className="flex flex-col md:flex-row gap-6 md:gap-8 md:items-start relative"
        >
          {/*
            The aside/TabsList live inside the page's own scrollable
            container (not behind a fixed header — the dashboard header is a
            normal sibling above it), so sticking to `top: 0` (plus a small
            gap on desktop to match the page's own top padding) is enough;
            no header-height offset needed.
          */}
          <aside
            className="hidden md:block w-full md:w-48 flex-shrink-0 md:sticky z-30"
            style={{ top: isDesktop ? "16px" : undefined }}
          >
            <SettingsTabNav isAdmin={isAdmin} isDesktop={isDesktop} />
          </aside>

          <div className="flex-1 px-4 md:px-0 min-w-0">
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
                  localRegistrationNumber={localRegistrationNumber}
                  setLocalRegistrationNumber={setLocalRegistrationNumber}
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
                  onlineStoreEnabled={onlineStoreEnabled}
                  setOnlineStoreEnabled={setOnlineStoreEnabled}
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
                  handleRestoreBackupTauri={handleRestoreBackupTauri}
                  isTauri={isTauri}
                  handleResetDatabase={handleResetDatabase}
                  setIsCloudLinkOpen={setIsCloudLinkOpen}
                  setSyncAfterLink={setSyncAfterLink}
                />
                <div className="mt-6">
                  <DemoDataSettings />
                </div>
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
