"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useFleetStats } from "@/lib/hooks/use-fleet-stats";
import { FleetStatsCards } from "./fleet-stats-cards";
import { FleetStatsTable } from "./fleet-stats-table";
import { FleetDailySummary } from "./fleet-daily-summary";

export function FleetOverview() {
  const { data, isLoading, isError } = useFleetStats();

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
        <FleetStatsCards stats={data.stats} />
        <FleetDailySummary />
        <FleetStatsTable stores={data.stores} />
      </CardContent>
    </Card>
  );
}
