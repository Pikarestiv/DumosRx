import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { useStockBatchStats } from "@/lib/hooks/use-stock-batch-stats";

/** All business logic for the Inventory Dashboard page — tab routing, stats, and the audit overlay. */
export function useStockBatchManagement(currentTab: string) {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [isAuditing, setIsAuditing] = useState(false);

  const stats = useStockBatchStats();

  useEffect(() => {
    if (currentTab === "audits") {
      setIsAuditing(true);
      router.replace("/inventory/overview");
    }
  }, [currentTab, router]);

  const handleTabChange = (value: string) => {
    router.push(`/inventory/${value}`);
  };

  return {
    isAdmin,
    isAuditing,
    setIsAuditing,
    stats,
    handleTabChange,
  };
}
