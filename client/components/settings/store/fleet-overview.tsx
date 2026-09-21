"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock } from "lucide-react";
import { useFleetStats } from "@/lib/hooks/use-fleet-stats";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { useStore } from "@/lib/context/store-context";
import { FleetStatsCards } from "./fleet-stats-cards";
import { FleetStatsTable } from "./fleet-stats-table";
import { FleetDailySummary } from "./fleet-daily-summary";

function FleetStatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-5 w-14" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FleetStatsTableSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex gap-4 px-2">
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-2 py-2">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function FleetOverview() {
  const { canManageMultiStore, getUpgradeMessage } = useFeatureGate();
  const { storeProfile } = useStore();
  const { data, isLoading, isError } = useFleetStats(canManageMultiStore);

  if (!canManageMultiStore) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fleet Overview</CardTitle>
          <CardDescription>A snapshot across every store on this account.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-primary/10 shrink-0">
                <Lock className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Fleet overview locked</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  {getUpgradeMessage(
                    "multi_store",
                    "Cross-store fleet stats are available on higher plans.",
                  )}
                </p>
              </div>
            </div>
            <Button variant="default" className="shrink-0" asChild>
              <Link href="/settings/billing">
                <Lock className="h-4 w-4 mr-2" />
                Upgrade Plan
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fleet Overview</CardTitle>
        <CardDescription>A snapshot across every store on this account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <>
            <FleetStatsCardsSkeleton />
            <FleetStatsTableSkeleton />
          </>
        ) : isError || !data ? (
          <p className="text-sm text-destructive">
            Failed to load fleet overview - check your connection.
          </p>
        ) : (
          <>
            <FleetStatsCards stats={data.stats} currencyCode={storeProfile?.currency} />
            <FleetDailySummary />
            <FleetStatsTable stores={data.stores} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
