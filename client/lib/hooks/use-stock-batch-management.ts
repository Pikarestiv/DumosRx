import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { useStockBatchStats } from "@/lib/hooks/use-stock-batch-stats";
import { useInventoryAudit } from "@/lib/context/inventory-audit-context";

/** All business logic for the Inventory Dashboard page: tab routing, stats, and the audit overlay. */
export function useStockBatchManagement(currentTab: string) {
  const { isAdmin, canManageStockBatch } = useAuth();
  const canPerformStockAudit = useHasPermission("perform_stock_audit");
  const canViewAdjustmentHistory = useHasPermission(
    "view_stock_adjustment_history",
  );
  const router = useRouter();
  // Owned by app/(dashboard)/layout.tsx, not local state here:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-stock-batch-management-ts-L16
  const { isAuditing, setIsAuditing } = useInventoryAudit();

  const stats = useStockBatchStats();

  useEffect(() => {
    if (currentTab === "audits") {
      if (canPerformStockAudit) setIsAuditing(true);
      router.replace("/inventory/overview");
    }
    // /inventory/batches is a generateStaticParams route with no <TabsContent> behind it, so it rendered a blank panel.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-stock-batch-management-ts-L30
    if (currentTab === "batches") {
      router.replace("/inventory/catalog");
    }
    // The "Movements" tab UI is hidden entirely for roles without stock-management access, but the /inventory/ledger route itself is still directl…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-stock-batch-management-ts-L36
    if (
      (currentTab === "ledger" || currentTab === "adjustments") &&
      !canViewAdjustmentHistory
    ) {
      router.replace("/inventory/overview");
    }
  }, [
    currentTab,
    canViewAdjustmentHistory,
    canPerformStockAudit,
    router,
    setIsAuditing,
  ]);

  // The sidebar's own <Link> only ever prefetches "/inventory" (wherever it points), never the *other* tabs reachable once you're already on thi…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-stock-batch-management-ts-L53
  useEffect(() => {
    router.prefetch("/inventory/catalog");
    if (canViewAdjustmentHistory) {
      router.prefetch("/inventory/ledger");
      router.prefetch("/inventory/adjustments");
    }
  }, [canViewAdjustmentHistory, router]);

  const handleTabChange = (value: string) => {
    router.push(`/inventory/${value}`);
  };

  return {
    isAdmin,
    canManageStockBatch,
    canPerformStockAudit,
    canViewAdjustmentHistory,
    isAuditing,
    setIsAuditing,
    stats,
    handleTabChange,
  };
}
