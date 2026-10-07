"use client";

import { Activity, AlertCircle, CheckCircle2, Clock, RefreshCcw, ShieldAlert, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAdminHealth, useAdminErrors } from "@/lib/api/admin-hooks";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";
import { HealthResourcesCard } from "@/components/admin/operations/health-resources-card";
import { HealthProbesCard } from "@/components/admin/operations/health-probes-card";
import { SentryIssuesCard } from "@/components/admin/operations/sentry-issues-card";
import { SyncHealthCard } from "@/components/admin/operations/sync-health-card";
import { MigrationStatusCard } from "@/components/admin/operations/migration-status-card";
import { useAdminSyncHealth } from "@/lib/api/admin-hooks-sync";

export default function OperationsPage() {
  const { data: health, isLoading, error, refetch } = useAdminHealth();
  const { data: errorsData, isLoading: errorsLoading } = useAdminErrors();
  const { data: syncHealth, isLoading: syncLoading, isError: syncError } = useAdminSyncHealth();

  if (isLoading && !health) {
    return <AdminSkeleton />;
  }

  if (error && !health) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="p-4 bg-rose-500/10 text-rose-500 rounded-full">
          <ShieldAlert className="h-10 w-10" />
        </div>
        <p className="text-rose-500 font-bold">Failed to load system data</p>
        <Button onClick={() => void refetch()} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  const isHealthy = health?.overallStatus === "Healthy";
  const connectMs = health?.databaseConnectMs;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
            <Activity className="h-8 w-8 text-indigo-500" />
            Operations
          </h1>
          <p className="text-muted-foreground mt-1">
            Infrastructure health, live service probes, and recent errors across the platform.
          </p>
        </div>
        <Button
          variant="outline"
          className="border-2 font-bold"
          onClick={() => void refetch()}
          disabled={isLoading}
        >
          <RefreshCcw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
          Run Diagnostics
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card
          className={cn(
            "border-none text-white shadow-lg",
            isHealthy ? "bg-emerald-500 shadow-emerald-500/20" : "bg-rose-500 shadow-rose-500/20",
          )}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-white/20 rounded-lg">
                {isHealthy ? <CheckCircle2 className="h-6 w-6" /> : <AlertCircle className="h-6 w-6" />}
              </div>
              <Badge className="bg-white/20 text-white border-none font-bold">
                {health?.overallStatus || "Checking..."}
              </Badge>
            </div>
            <h3 className="text-sm font-bold uppercase tracking-widest opacity-80">
              Overall System Status
            </h3>
            <p className="text-3xl font-black mt-1">
              {isHealthy ? "All Systems Go" : "Degraded"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardContent className="p-6">
            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500 w-fit mb-4">
              <Clock className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Platform Age
            </h3>
            <p className="text-3xl font-black mt-1 text-foreground">
              {health?.platformAge || "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Since the first recorded activity</p>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
          <CardContent className="p-6">
            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500 w-fit mb-4">
              <Zap className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Database Connect Time
            </h3>
            <p className="text-3xl font-black mt-1 text-foreground">
              {connectMs === null || connectMs === undefined ? "—" : `${connectMs}ms`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">One round trip, measured on request</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {health && <HealthResourcesCard resources={health.resources} />}
        {health && <HealthProbesCard probes={health.probes} />}
      </div>

      <SyncHealthCard data={syncHealth} isLoading={syncLoading} isError={syncError} />

      <MigrationStatusCard />

      <SentryIssuesCard data={errorsData} isLoading={errorsLoading} />
    </div>
  );
}
