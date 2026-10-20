"use client";

import { Tabs, TabsContent } from "@/components/ui/tabs";
import { CloudLinkDialog } from "@/components/settings/cloud-link-dialog";
import { StaffManagement } from "@/components/settings/staff-management";
import { SettingsMobileMenu } from "@/components/settings/settings-mobile-menu";
import { SettingsTabNav } from "./settings-tab-nav";
import { SettingsHeader } from "./settings-header";

import { AccountSettings } from "@/components/settings/account/account-settings";
import { MultiStoreCard } from "@/components/settings/store/multi-store-card";
import { CategoriesCard } from "@/components/settings/store/categories-card";
import { ProductUnitsCard } from "@/components/settings/store/product-units-card";
import { SystemSettings } from "@/components/settings/system-settings";

import { AppearancePanel } from "./panels/appearance-panel";
import { BusinessInfoPanel } from "./panels/business-info-panel";
import { AlertsPanel } from "./panels/alerts-panel";
import { DangerZonePanel } from "./panels/danger-zone-panel";
const DeviceDiagnosticsPanel = dynamic(
  () =>
    import("@/components/settings/device-diagnostics").then(
      (m) => m.DeviceDiagnosticsPanel,
    ),
  { ssr: false },
);
import { isTillInspectionSession } from "@/lib/utils/till-inspection";
import { isImpersonatedSession } from "@/lib/utils/impersonation";
import { SecurityPanel } from "./panels/security-panel";
import { PaymentMethodsPanel } from "./panels/payment-methods-panel";
import { ReceiptSettingsPanel } from "./panels/receipt-settings-panel";
import { RegisterConfigsPanel } from "./panels/register-configs-panel";

import { useSettings } from "@/hooks/use-settings";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

// Only one settings tab renders at a time, and these four are the heaviest and least-visited of the eighteen:
// Rationale: docs/CLIENT_COMMENTS.md#line-app-(dashboard)-settings-[tab]-settings-client-tsx-L38
const PanelFallback = () => (
  <div className="py-10 text-center text-sm text-muted-foreground">
    Loading...
  </div>
);

const BillingSettings = dynamic(
  () =>
    import("@/components/settings/billing/billing-settings").then(
      (m) => m.BillingSettings,
    ),
  { loading: PanelFallback },
);

const PermissionMatrix = dynamic(
  () =>
    import("@/components/settings/roles-permissions/permission-matrix").then(
      (m) => m.PermissionMatrix,
    ),
  { loading: PanelFallback },
);

const FleetOverview = dynamic(
  () =>
    import("@/components/settings/store/fleet-overview").then(
      (m) => m.FleetOverview,
    ),
  { loading: PanelFallback },
);

const DataPanel = dynamic(
  () => import("./panels/data-panel").then((m) => m.DataPanel),
  { loading: PanelFallback },
);

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
  "danger-zone": "Danger Zone",
  diagnostics: "Diagnostics",
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
          <SettingsMobileMenu isAdmin={s.isAdmin} canAccessTab={s.canAccessTab} />
        </div>
      </div>
    );
  }

  // With the app sidebar/header hidden on every settings route, this header (and its back button) is the only way out — show…
  // Rationale: docs/CLIENT_COMMENTS.md#line-app-(dashboard)-settings-[tab]-settings-client-tsx-L112
  return (
    <Tabs
      value={s.activeTab}
      onValueChange={s.handleTabChange}
      orientation="vertical"
      className="flex flex-col md:flex-row w-full overflow-hidden bg-background"
      style={{ height: "calc(100dvh - var(--tauri-top, 0px))" }}
    >
      <aside className="hidden md:flex md:flex-col w-full md:w-56 flex-shrink-0 h-full min-h-0 overflow-y-auto stable-scrollbar border-border/50 p-3 pr-2">
        <SettingsTabNav isAdmin={s.isAdmin} canAccessTab={s.canAccessTab} />
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

          {s.canAccessTab("business-info") && (
            <TabsContent value="business-info" className="space-y-6">
              <BusinessInfoPanel {...s} />
            </TabsContent>
          )}

          {s.canAccessTab("branches") && (
            <TabsContent value="branches" className="space-y-6">
              <FleetOverview />
              <MultiStoreCard />
            </TabsContent>
          )}

          <TabsContent value="notifications">
            <AlertsPanel {...s} />
          </TabsContent>

          {s.canAccessTab("data") && (
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
            <TabsContent value="roles" className="h-full">
              <PermissionMatrix />
            </TabsContent>
          )}

          {s.canAccessTab("payment-methods") && (
            <TabsContent value="payment-methods" className="space-y-6">
              <PaymentMethodsPanel {...s} />
            </TabsContent>
          )}

          {s.canAccessTab("receipt-settings") && (
            <TabsContent value="receipt-settings" className="space-y-6">
              <ReceiptSettingsPanel {...s} />
            </TabsContent>
          )}

          {s.canAccessTab("register-configs") && (
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

          {s.canAccessTab("system") && (
            <TabsContent value="system">
              <SystemSettings />
            </TabsContent>
          )}

          {s.canAccessTab("billing") && (
            <TabsContent value="billing">
              <BillingSettings />
            </TabsContent>
          )}

          {s.isAdmin && (
            <TabsContent value="danger-zone">
              <DangerZonePanel {...s} />
            </TabsContent>
          )}

          {/* Support surface, not a store feature: — docs/CLIENT_COMMENTS.md#block-app-(dashboard)-settings-[tab]-settings-client-tsx-L240 */}
          {(isTillInspectionSession() || isImpersonatedSession()) && (
            <TabsContent value="diagnostics">
              <DeviceDiagnosticsPanel />
            </TabsContent>
          )}
        </div>
      </div>

      <CloudLinkDialog
        open={s.isCloudLinkOpen}
        onOpenChange={s.setIsCloudLinkOpen}
        onSuccess={() => {
          if (s.syncAfterLink) {
            void s.handleSync(true);
          }
        }}
      />
    </Tabs>
  );
}
