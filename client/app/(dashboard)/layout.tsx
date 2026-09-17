import type React from "react";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { InventoryAuditProvider } from "@/lib/context/inventory-audit-context";
import { InventoryAuditOverlay } from "@/components/stock-batch/inventory-audit-overlay";

export default function AppDashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // InventoryAuditProvider must wrap DashboardLayout from the outside, not live
  // inside it: DashboardLayout keys its page-content wrapper on `pathname` (to
  // retrigger the route-transition animation on every navigation), which force
  // -remounts everything below it - including any inventory/[tab] layout - on
  // every navigation. That's what was silently resetting the audit overlay's
  // open state right after "Start Audit" set it.
  return (
    <InventoryAuditProvider>
      <DashboardLayout>{children}</DashboardLayout>
      <InventoryAuditOverlay />
    </InventoryAuditProvider>
  );
}
