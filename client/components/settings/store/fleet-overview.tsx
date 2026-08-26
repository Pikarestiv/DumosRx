"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Lock } from "lucide-react";
import { useFleetStats } from "@/lib/hooks/use-fleet-stats";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { useStore } from "@/lib/context/store-context";
import { FleetStatsCards } from "./fleet-stats-cards";
import { FleetStatsTable } from "./fleet-stats-table";
import { FleetDailySummary } from "./fleet-daily-summary";

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

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">
          Failed to load fleet overview - check your connection.
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
        <FleetStatsCards stats={data.stats} currencyCode={storeProfile?.currency} />
        <FleetDailySummary />
        <FleetStatsTable stores={data.stores} />
      </CardContent>
    </Card>
  );
}
