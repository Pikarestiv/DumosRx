import type React from "react";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { InventoryAuditProvider } from "@/lib/context/inventory-audit-context";
import { InventoryAuditOverlay } from "@/components/stock-batch/inventory-audit-overlay";

export default function AppDashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // InventoryAuditProvider must wrap DashboardLayout from the outside, not live inside it:
  // Rationale: docs/CLIENT_COMMENTS.md#line-app-(dashboard)-layout-tsx-L11
  return (
    <InventoryAuditProvider>
      <DashboardLayout>{children}</DashboardLayout>
      <InventoryAuditOverlay />
    </InventoryAuditProvider>
  );
}
