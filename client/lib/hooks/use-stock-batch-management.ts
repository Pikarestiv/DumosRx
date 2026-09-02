import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { useStockBatchStats } from "@/lib/hooks/use-stock-batch-stats";

/** All business logic for the Inventory Dashboard page: tab routing, stats, and the audit overlay. */
export function useStockBatchManagement(currentTab: string) {
  const { isAdmin, canManageStockBatch } = useAuth();
  const router = useRouter();
  const [isAuditing, setIsAuditing] = useState(false);

  const stats = useStockBatchStats();

  useEffect(() => {
    if (currentTab === "audits") {
      setIsAuditing(true);
      router.replace("/inventory/overview");
    }
    // The "Movements" tab UI is hidden entirely for roles without stock-management
    // access, but the /inventory/ledger route itself is still directly reachable
    // (typed URL, stale bookmark) - bounce those viewers back to a tab they can see.
    if (currentTab === "ledger" && !canManageStockBatch) {
      router.replace("/inventory/overview");
    }
  }, [currentTab, canManageStockBatch, router]);

  const handleTabChange = (value: string) => {
    router.push(`/inventory/${value}`);
  };

  return {
    isAdmin,
    canManageStockBatch,
    isAuditing,
    setIsAuditing,
    stats,
    handleTabChange,
  };
}
