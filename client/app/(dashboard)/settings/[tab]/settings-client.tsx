"use client";

import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ChevronLeft } from "lucide-react";
import { CloudLinkDialog } from "@/components/settings/cloud-link-dialog";
import { StaffManagement } from "@/components/settings/staff-management";
import { SettingsMobileMenu } from "@/components/settings/settings-mobile-menu";
import { RolesPermissionsPlaceholder } from "@/components/settings/roles-permissions-placeholder";
import { UserProfileBadge } from "@/components/dashboard/user-profile-badge";
import { SettingsTabNav } from "./settings-tab-nav";

import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { AlertSettings } from "@/components/settings/alert-settings";
import { DataSettings } from "@/components/settings/data-settings";
import { DemoDataSettings } from "@/components/settings/demo-data-settings";
import { SecuritySettings } from "@/components/settings/security-settings";
import { SystemSettings } from "@/components/settings/system-settings";
import { BillingSettings } from "@/components/settings/billing/billing-settings";
import { AccountSettings } from "@/components/settings/account/account-settings";

import { BusinessVerticalCard } from "@/components/settings/store/business-vertical-card";
import { BusinessInformationCard } from "@/components/settings/store/business-information-card";
import { ContactSpecialistCard } from "@/components/settings/store/contact-specialist-card";
import { FleetOverview } from "@/components/settings/store/fleet-overview";
import { MultiStoreCard } from "@/components/settings/store/multi-store-card";
import { PaymentSettingsCard } from "@/components/settings/store/payment-settings-card";
import { PaymentAccountsCard } from "@/components/settings/store/payment-accounts-card";
import { ReceiptCustomizationCard } from "@/components/settings/store/receipt-customization-card";
import { CategoriesCard } from "@/components/settings/store/categories-card";
import { RegisterConfigCard } from "@/components/settings/store/register-config-card";
import { ProductUnitsCard } from "@/components/settings/store/product-units-card";

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
    requireSaleNotes,
    setRequireSaleNotes,
    displayStockLevels,
    setDisplayStockLevels,
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
    return (
      <div
        className="flex flex-col w-full overflow-hidden bg-background"
        style={{ height: "calc(100dvh - var(--tauri-top, 0px))" }}
      >
        <div className="shrink-0 flex items-center gap-3 px-4 py-4 border-border/50">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-xl bg-muted/50 border-border/50 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => router.push("/dashboard")}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <div className="text-lg font-semibold">Settings</div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
          <SettingsMobileMenu isAdmin={isAdmin} />
        </div>
      </div>
    );
  }

  const TAB_LABELS: Record<string, string> = {
    appearance: "General",
    notifications: "Alerts",
    "personal-info": "Personal Info",
    "business-info": "Business Info",
    "payment-methods": "Payment Methods",
    "receipt-settings": "Receipt Settings",
    "register-configs": "Register Configs",
    "product-units": "Product Units",
    roles: "Roles & Permissions",
  };

  // With the app sidebar/header hidden on every settings route, this
  // header (and its back button) is the only way out — shown on desktop
  // too now, not just mobile. Desktop has no separate menu-list route (the
  // tab rail below is the nav), so its back button exits straight to the
  // dashboard; mobile's inner-tab back button returns to the menu list.
  //
  // The whole page takes a real, explicit height (not page-flow auto) so
  // the aside and the tab content below the header can each be given their
  // own bounded box and scroll independently — the aside's nav list no
  // longer scrolls away with the page, it stays put and scrolls itself
  // only if its own content overflows.
  return (
    <Tabs
      value={activeTab}
      onValueChange={handleTabChange}
      orientation="vertical"
      className="flex flex-col md:flex-row w-full overflow-hidden bg-background"
      style={{ height: "calc(100dvh - var(--tauri-top, 0px))" }}
    >
      {/* Runs the full height of the settings view — the header (unlike
          the app's old top bar) starts to the right of this rail, not
          above it. */}
      <aside className="hidden md:flex md:flex-col w-full md:w-56 flex-shrink-0 h-full overflow-y-auto border-border/50 p-3 pr-0">
        <SettingsTabNav isAdmin={isAdmin} isDesktop={isDesktop} />
      </aside>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center gap-3 px-4 py-4 border-border/50">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-xl bg-muted/50 border-border/50 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => router.push(isDesktop ? "/dashboard" : "/settings")}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <div className="text-lg font-semibold capitalize">
            {TAB_LABELS[activeTab] ?? activeTab}
          </div>

          <div className="ml-auto hidden sm:block">
            <UserProfileBadge />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6">
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
            <TabsContent value="personal-info">
              <AccountSettings />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="business-info" className="space-y-6">
              <BusinessVerticalCard
                storeType={storeType}
                handleSwitchVertical={handleSwitchVertical}
              />
              <ContactSpecialistCard />
              <BusinessInformationCard
                storeType={storeType}
                localName={localName}
                setLocalName={setLocalName}
                localAddress={localAddress}
                setLocalAddress={setLocalAddress}
                localPhone={localPhone}
                setLocalPhone={setLocalPhone}
                localEmail={localEmail}
                setLocalEmail={setLocalEmail}
                localRegistrationNumber={localRegistrationNumber}
                setLocalRegistrationNumber={setLocalRegistrationNumber}
                localLogo={localLogo}
                handleLogoUpload={handleLogoUpload}
                handleRemoveLogo={handleRemoveLogo}
                localStoreSlug={localStoreSlug}
                setLocalStoreSlug={setLocalStoreSlug}
                localPcn={localPcn}
                setLocalPcn={setLocalPcn}
                showRetailSuggestions={showRetailSuggestions}
                setShowRetailSuggestions={setShowRetailSuggestions}
                onlineStoreEnabled={onlineStoreEnabled}
                setOnlineStoreEnabled={setOnlineStoreEnabled}
                handleSaveProfile={handleSaveProfile}
              />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="branches" className="space-y-6">
              <FleetOverview />
              <MultiStoreCard />
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
            <TabsContent value="roles">
              <RolesPermissionsPlaceholder />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="payment-methods" className="space-y-6">
              <PaymentSettingsCard
                requirePaymentAccount={requirePaymentAccount}
                setRequirePaymentAccount={setRequirePaymentAccount}
                enabledPaymentMethods={enabledPaymentMethods}
                setEnabledPaymentMethods={setEnabledPaymentMethods}
              />
              <PaymentAccountsCard />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="receipt-settings" className="space-y-6">
              <ReceiptCustomizationCard
                localName={localName}
                localAddress={localAddress}
                localPhone={localPhone}
                localLogo={localLogo}
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
              />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="register-configs">
              <RegisterConfigCard
                requireSaleNotes={requireSaleNotes}
                setRequireSaleNotes={setRequireSaleNotes}
                displayStockLevels={displayStockLevels}
                setDisplayStockLevels={setDisplayStockLevels}
              />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="product-units">
              <ProductUnitsCard />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="categories" className="space-y-6">
              <CategoriesCard />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="system">
              <SystemSettings />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="billing">
              <BillingSettings />
            </TabsContent>
          )}
        </div>
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
    </Tabs>
  );
}
