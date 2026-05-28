"use client";

import { useEffect, useState } from "react";
import { 
  Activity,
  ShieldAlert,
  Plus,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminSummary } from "@/lib/api/admin-hooks";
import { useRouter } from "next/navigation";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";

import { StatsGrid } from "@/components/admin/dashboard/stats-grid";
import { RecentPharmacies } from "@/components/admin/dashboard/recent-pharmacies";
import { SystemHealth } from "@/components/admin/dashboard/system-health";
import { PharmacyDialog } from "@/components/admin/dashboard/pharmacy-dialog";

export default function AdminDashboard() {
  const { data: summary, isLoading, error, refetch } = useAdminSummary();
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedPharmacy, setSelectedPharmacy] = useState<any>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (isLoading && !summary) {
    return <AdminSkeleton />;
  }

  if (error && !summary) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="p-4 bg-rose-500/10 text-rose-500 rounded-full">
            <ShieldAlert className="h-10 w-10" />
        </div>
        <p className="text-rose-500 font-bold">{error instanceof Error ? error.message : "Failed to sync platform data"}</p>
        <Button onClick={() => refetch()} variant="outline">Retry Sync</Button>
      </div>
    );
  }

  const globalStats = summary?.stats || [];
  const recentPharmacies = summary?.recent_pharmacies || [];
  const liveOperations = summary?.live_operations || {};
  const securityAlerts = summary?.security_alerts || [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">Global Control</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium italic">
            Connected to Production Cluster • {currentTime.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
            <Button 
                variant="outline" 
                className="border-2 font-bold dark:bg-slate-900 dark:border-slate-800"
                onClick={() => refetch()}
                disabled={isLoading}
            >
                {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2 text-indigo-500" />}
                Refresh Pulse
            </Button>
            <Button 
                className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-600/20"
                onClick={() => router.push("/admin/pharmacies/new")}
            >
                <Plus className="h-4 w-4 mr-2" />
                Register Pharmacy
            </Button>
        </div>
      </div>

      <StatsGrid globalStats={globalStats} />

      <div className="grid lg:grid-cols-3 gap-8">
        <RecentPharmacies 
          recentPharmacies={recentPharmacies} 
          setSelectedPharmacy={setSelectedPharmacy} 
        />
        <SystemHealth 
          liveOperations={liveOperations} 
          securityAlerts={securityAlerts} 
        />
      </div>

      <PharmacyDialog 
        selectedPharmacy={selectedPharmacy} 
        setSelectedPharmacy={setSelectedPharmacy} 
      />
    </div>
  );
}
