"use client";

import { Suspense } from "react";
import { useDashboard } from "./use-dashboard";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";

// Layout Components
import { Sidebar } from "@/components/dashboard/sidebar";
import { Header } from "@/components/dashboard/header";
import { BroadcastBanner } from "@/components/dashboard/broadcast-banner";
import { BottomNav } from "@/components/dashboard/bottom-nav";

// View Components
import { OverviewView } from "@/components/dashboard/views/overview-view";
import { FleetView } from "@/components/dashboard/views/fleet-view";
import { StaffView } from "@/components/dashboard/views/staff-view";
import { ActivitiesView } from "@/components/dashboard/views/activities-view";
import { BillingView } from "@/components/dashboard/views/billing-view";
import { DownloadsView } from "@/components/dashboard/views/downloads-view";
import { NotificationsView } from "@/components/dashboard/views/notifications-view";
import { ProfileView } from "@/components/dashboard/views/profile-view";
import { webApiClient } from "@/lib/api/client";

export function DashboardClient({ view }: { view: string }) {
  const {
    activeTab: _activeTab,
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
        return <OverviewView stats={stats} user={user} stores={stores} onReset={resetAccountData} onNavigate={setActiveTab} />;
      case "fleet":
        return <FleetView stores={stores} />;
      case "staff":
        return (
          <Suspense fallback={<DashboardSkeleton />}>
            <StaffView staff={staff} stores={stores} />
          </Suspense>
        );
      case "activities":
        return <ActivitiesView stores={stores} />;
      case "billing":
        return <BillingView />;
      case "downloads":
        return <DownloadsView releaseLinks={releaseLinks} />;
      case "notifications":
        return <NotificationsView onBack={() => setActiveTab("overview")} />;
      case "profile":
        return <ProfileView />;
      default:
        return <OverviewView stats={stats} user={user} stores={stores} onReset={resetAccountData} onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar 
        activeTab={view} 
        setActiveTab={setActiveTab} 
        user={user} 
        onLogout={logout} 
      />
      <div className="flex-1 flex flex-col min-w-0">
        <BroadcastBanner />
        <Header onSetActiveTab={setActiveTab} />
        <main className="flex-1 overflow-y-auto p-4 md:p-8 scrollbar-hide pb-24 md:pb-8">
          <div className="max-w-7xl mx-auto">
            {renderView()}
          </div>
        </main>
      </div>
      <BottomNav activeTab={view} setActiveTab={setActiveTab} user={user} onLogout={logout} />
    </div>
  );
}
