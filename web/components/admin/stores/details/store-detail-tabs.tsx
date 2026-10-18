"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AdminStoreDetail } from "@/lib/types/admin";
import { adminStoreDetailPath } from "@/lib/admin-routes";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStoreStockDivergence, useStoreTableAgreement } from "@/lib/api/admin-hooks-sync";
import { syncVerdict, type SyncVerdict, type SyncVerdictTone } from "@/lib/admin/sync-verdict";
import { StoreOverviewTab } from "@/components/admin/stores/details/store-overview-tab";
import { StoreSyncTab } from "@/components/admin/stores/details/store-sync-tab";
import { StoreActivityTab } from "@/components/admin/stores/details/store-activity-tab";

type StoreDetailTab = "overview" | "sync" | "activity";

function resolveTab(value: string | null | undefined): StoreDetailTab {
  switch (value ?? "") {
    case "sync":
      return "sync";
    case "activity":
      return "activity";
    default:
      return "overview";
  }
}

function toneClasses(tone: SyncVerdictTone): string {
  switch (tone) {
    case "rose":
      return "bg-rose-500 text-white";
    case "amber":
      return "bg-amber-500 text-white";
    case "emerald":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    case "neutral":
      return "bg-background/80 text-muted-foreground";
  }
}

function SyncVerdictPill({ verdict }: { verdict: SyncVerdict | null }) {
  if (!verdict) return null;

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${toneClasses(verdict.tone)}`}
    >
      {verdict.label}
    </span>
  );
}

export function StoreDetailTabs({ store }: { store: AdminStoreDetail }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = resolveTab(searchParams?.get("tab"));
  const activeTriggerRef = useRef<HTMLButtonElement>(null);

  const table = useStoreTableAgreement(store.id);
  const stock = useStoreStockDivergence(store.id);
  const verdict = syncVerdict({ table, stock });

  useEffect(() => {
    activeTriggerRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, []);

  const handleTabChange = (value: string) => {
    const tab = resolveTab(value);
    const path = adminStoreDetailPath(store.id);
    router.replace(tab === "overview" ? path : `${path}&tab=${tab}`, { scroll: false });
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="mb-4 bg-muted w-full flex overflow-x-auto whitespace-nowrap justify-start p-1 h-12 gap-1">
        <TabsTrigger
          value="overview"
          className="px-4 shrink-0 gap-2 min-h-11"
          ref={activeTab === "overview" ? activeTriggerRef : undefined}
        >
          Overview
        </TabsTrigger>
        <TabsTrigger
          value="sync"
          className="px-4 shrink-0 gap-2 min-h-11"
          ref={activeTab === "sync" ? activeTriggerRef : undefined}
        >
          {"Sync "}
          <SyncVerdictPill verdict={verdict} />
        </TabsTrigger>
        <TabsTrigger
          value="activity"
          className="px-4 shrink-0 gap-2 min-h-11"
          ref={activeTab === "activity" ? activeTriggerRef : undefined}
        >
          Activity
        </TabsTrigger>
      </TabsList>

      <p role="status" aria-atomic="true" className="sr-only">
        {verdict?.announcement ?? ""}
      </p>

      <TabsContent value="overview" className="focus-visible:outline-none">
        <StoreOverviewTab store={store} />
      </TabsContent>

      <TabsContent value="sync" className="focus-visible:outline-none">
        <StoreSyncTab store={store} />
      </TabsContent>

      <TabsContent value="activity" className="focus-visible:outline-none">
        <StoreActivityTab store={store} />
      </TabsContent>
    </Tabs>
  );
}
