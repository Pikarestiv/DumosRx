"use client";

import { useState } from "react";
import { Activity, ShieldAlert, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminSummary } from "@/lib/api/admin-hooks";
import { useRouter } from "next/navigation";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";

import { StatsGrid } from "@/components/admin/dashboard/stats-grid";
import { RecentStores } from "@/components/admin/dashboard/recent-stores";
import { SystemHealth } from "@/components/admin/dashboard/system-health";
import { StoreDialog } from "@/components/admin/dashboard/store-dialog";

import { LiveClock } from "@/components/admin/dashboard/live-clock";
import type { AdminStoreSummary } from "@/lib/types/admin";

export default function AdminDashboard() {
  const { data: summary, isLoading, error, refetch } = useAdminSummary();
  const router = useRouter();
  const [selectedStore, setSelectedStore] = useState<AdminStoreSummary | null>(null);

  if (isLoading && !summary) {
    return <AdminSkeleton />;
  }

  if (error && !summary) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="p-4 bg-rose-500/10 text-rose-500 rounded-full">
          <ShieldAlert className="h-10 w-10" />
        </div>
        <p className="text-rose-500 font-bold">
          {error instanceof Error
            ? error.message
            : "Failed to sync platform data"}
        </p>
        <Button onClick={() => refetch()} variant="outline">
          Retry Sync
        </Button>
      </div>
    );
  }

  const globalStats = summary?.stats || [];
  const recentStores = summary?.recent_stores || [];
  const liveOperations = summary?.live_operations || {};
  const securityAlerts = summary?.security_alerts || [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
            Global Control
          </h1>
          <div className="text-slate-500 dark:text-slate-400 mt-1 font-medium italic flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <span>
              Connected to{" "}
              {process.env.NODE_ENV === "development"
                ? "Dev Cluster"
                : "Production Cluster"}
            </span>
            <span className="hidden sm:inline">•</span>
            <LiveClock />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="border-2 font-bold dark:bg-slate-900 dark:border-slate-800"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Activity className="h-4 w-4 mr-2 text-indigo-500" />
            )}
            Refresh Pulse
          </Button>
          <Button
            className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-600/20"
            onClick={() => router.push("/admin/stores/new")}
          >
            <Plus className="h-4 w-4 mr-2" />
            Register Store
          </Button>
        </div>
      </div>

      <StatsGrid globalStats={globalStats} />

      <div className="grid lg:grid-cols-3 gap-8">
        <RecentStores
          recentStores={recentStores}
          setSelectedStore={setSelectedStore}
        />
        <SystemHealth
          liveOperations={liveOperations}
          securityAlerts={securityAlerts}
        />
      </div>

      <StoreDialog
        selectedStore={selectedStore}
        setSelectedStore={setSelectedStore}
      />
    </div>
  );
}
