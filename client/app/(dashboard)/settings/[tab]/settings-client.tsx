"use client";

import { Tabs, TabsContent } from "@/components/ui/tabs";
import { CloudLinkDialog } from "@/components/settings/cloud-link-dialog";
import { StaffManagement } from "@/components/settings/staff-management";
import { SettingsMobileMenu } from "@/components/settings/settings-mobile-menu";
import { RolesPermissionsPlaceholder } from "@/components/settings/roles-permissions-placeholder";
import { SettingsTabNav } from "./settings-tab-nav";
import { SettingsHeader } from "./settings-header";

import { BillingSettings } from "@/components/settings/billing/billing-settings";
import { AccountSettings } from "@/components/settings/account/account-settings";
import { FleetOverview } from "@/components/settings/store/fleet-overview";
import { MultiStoreCard } from "@/components/settings/store/multi-store-card";
import { CategoriesCard } from "@/components/settings/store/categories-card";
import { ProductUnitsCard } from "@/components/settings/store/product-units-card";
import { SystemSettings } from "@/components/settings/system-settings";

import { AppearancePanel } from "./panels/appearance-panel";
import { BusinessInfoPanel } from "./panels/business-info-panel";
import { AlertsPanel } from "./panels/alerts-panel";
import { DataPanel } from "./panels/data-panel";
import { SecurityPanel } from "./panels/security-panel";
import { PaymentMethodsPanel } from "./panels/payment-methods-panel";
import { ReceiptSettingsPanel } from "./panels/receipt-settings-panel";
import { RegisterConfigsPanel } from "./panels/register-configs-panel";

import { useSettings } from "@/hooks/use-settings";
import { useRouter } from "next/navigation";

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

export default function SettingsPage({ isIndex }: { isIndex?: boolean }) {
  const s = useSettings();
  const router = useRouter();

  if (!s.isDesktop && isIndex) {
    return (
      <div
        className="flex flex-col w-full overflow-hidden bg-background"
        style={{ height: "calc(100dvh - var(--tauri-top, 0px))" }}
      >
        <SettingsHeader
          title="Settings"
          onBack={() => router.push("/dashboard")}
        />
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
          <SettingsMobileMenu isAdmin={s.isAdmin} />
        </div>
      </div>
    );
  }

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
      value={s.activeTab}
      onValueChange={s.handleTabChange}
      orientation="vertical"
      className="flex flex-col md:flex-row w-full overflow-hidden bg-background"
      style={{ height: "calc(100dvh - var(--tauri-top, 0px))" }}
    >
      <aside className="hidden md:flex md:flex-col w-full md:w-56 flex-shrink-0 h-full overflow-y-auto border-border/50 p-3 pr-0">
        <SettingsTabNav isAdmin={s.isAdmin} isDesktop={s.isDesktop} />
      </aside>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <SettingsHeader
          title={TAB_LABELS[s.activeTab] ?? s.activeTab}
          onBack={() => router.push(s.isDesktop ? "/dashboard" : "/settings")}
          showBadge
        />

        <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 pb-4">
          <TabsContent value="appearance">
            <AppearancePanel {...s} />
          </TabsContent>

          {s.isAdmin && (
            <TabsContent value="personal-info">
              <AccountSettings />
            </TabsContent>
          )}

          {s.isAdmin && (
            <TabsContent value="business-info" className="space-y-6">
              <BusinessInfoPanel {...s} />
            </TabsContent>
          )}

          {s.isAdmin && (
            <TabsContent value="branches" className="space-y-6">
              <FleetOverview />
              <MultiStoreCard />
            </TabsContent>
          )}

          <TabsContent value="notifications">
            <AlertsPanel {...s} />
          </TabsContent>

          {s.isAdmin && (
            <TabsContent value="data">
              <DataPanel {...s} />
            </TabsContent>
          )}

          <TabsContent value="security">
            <SecurityPanel {...s} />
          </TabsContent>

          {s.isAdmin && (
            <TabsContent value="staff">
              <StaffManagement />
            </TabsContent>
          )}

          {s.isAdmin && (
            <TabsContent value="roles">
              <RolesPermissionsPlaceholder />
            </TabsContent>
          )}

          {s.isAdmin && (
            <TabsContent value="payment-methods" className="space-y-6">
              <PaymentMethodsPanel {...s} />
            </TabsContent>
          )}

          {s.isAdmin && (
            <TabsContent value="receipt-settings" className="space-y-6">
              <ReceiptSettingsPanel {...s} />
            </TabsContent>
          )}

          {s.isAdmin && (
            <TabsContent value="register-configs">
              <RegisterConfigsPanel {...s} />
            </TabsContent>
          )}

          {s.isAdmin && (
            <TabsContent value="product-units">
              <ProductUnitsCard />
            </TabsContent>
          )}

          {s.isAdmin && (
            <TabsContent value="categories" className="space-y-6">
              <CategoriesCard />
            </TabsContent>
          )}

          {s.isAdmin && (
            <TabsContent value="system">
              <SystemSettings />
            </TabsContent>
          )}

          {s.isAdmin && (
            <TabsContent value="billing">
              <BillingSettings />
            </TabsContent>
          )}
        </div>
      </div>

      <CloudLinkDialog
        open={s.isCloudLinkOpen}
        onOpenChange={s.setIsCloudLinkOpen}
        onSuccess={() => {
          if (s.syncAfterLink) {
            s.handleSync(true);
          }
        }}
      />
    </Tabs>
  );
}
