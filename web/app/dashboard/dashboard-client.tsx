"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { useDashboard } from "./use-dashboard";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";

// Layout Components
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";

// View Components
import { OverviewView } from "@/components/dashboard/views/overview-view";
import { FleetView } from "@/components/dashboard/views/fleet-view";
import { StaffView } from "@/components/dashboard/views/staff-view";
import { BillingView } from "@/components/dashboard/views/billing-view";
import { DownloadsView } from "@/components/dashboard/views/downloads-view";
import { NotificationsView } from "@/components/dashboard/views/notifications-view";
import { webApiClient } from "@/lib/api/client";

export function DashboardClient({ view }: { view: string }) {
  const {
    activeTab,
    setActiveTab,
    loading,
    data,
    releaseLinks,
    logout,
    user,
    stores,
    stats,
    staff,
    refetch,
  } = useDashboard();

  const resetAccountData = async (type: string = "all") => {
    try {
      const response = await webApiClient.resetData(type);
      await refetch();
      return { success: true, message: response.message };
    } catch (error) {
      console.error("Failed to reset data:", error);
      return { success: false, error: error instanceof Error ? error.message : "Reset failed" };
    }
  };

  const renderView = () => {
    if (loading && !data) return <DashboardSkeleton />;

    switch (view) {
      case "overview":
        return <OverviewView stats={stats} user={user} stores={stores} onReset={resetAccountData} />;
      case "fleet":
        return <FleetView stores={stores} />;
      case "staff":
        return (
          <Suspense fallback={<DashboardSkeleton />}>
            <StaffView staff={staff} stores={stores} />
          </Suspense>
        );
      case "billing":
        return <BillingView />;
      case "downloads":
        return <DownloadsView releaseLinks={releaseLinks} />;
      case "notifications":
        return <NotificationsView onBack={() => setActiveTab("overview")} />;
      default:
        return <OverviewView stats={stats} user={user} stores={stores} onReset={resetAccountData} />;
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar activeTab={view} setActiveTab={setActiveTab} user={user} onLogout={logout} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header onSetActiveTab={setActiveTab} />
        <main className="flex-1 overflow-y-auto p-8 scrollbar-hide">
          <div className="max-w-7xl mx-auto">
            {renderView()}
          </div>
        </main>
      </div>
    </div>
  );
}
