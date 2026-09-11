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

  // The sidebar's own <Link> only ever prefetches "/inventory" (wherever it
  // points), never the *other* tabs reachable once you're already on this
  // page — those switch via router.push() from handleTabChange below, which
  // Next never auto-prefetches the way a rendered <Link> does. Each of
  // "/inventory/[tab]" (catalog, ledger) is its own separate JS chunk from
  // "/inventory" itself, so the first click into a not-yet-visited tab pays
  // a real network+parse cost with nothing on screen to show for it yet —
  // confirmed live via a production Network-tab capture (a fresh
  // "catalog.txt?_rsc=" + "page-*.js" fetch firing exactly when the tab was
  // clicked). Warming both here, once, as soon as any inventory tab mounts
  // means that cost is already paid in the background by the time it's
  // needed, regardless of which tab the user lands on first.
  useEffect(() => {
    router.prefetch("/inventory/catalog");
    if (canManageStockBatch) {
      router.prefetch("/inventory/ledger");
    }
  }, [canManageStockBatch, router]);

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
