"use client";

import { Loader2 } from "lucide-react";
import { useDashboard } from "./use-dashboard";

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

export function DashboardClient({ view }: { view: string }) {
  const {
    activeTab,
    setActiveTab,
    loading,
    data,
    releaseLinks,
    logout,
    resetAccountData,
    user,
    stores,
    stats,
    staff,
  } = useDashboard();

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
          <p className="text-muted-foreground font-black animate-pulse">Initializing Dashboard...</p>
        </div>
      </div>
    );
  }

  const renderView = () => {
    switch (view) {
      case "overview":
        return <OverviewView stats={stats} user={user} stores={stores} onReset={resetAccountData} />;
      case "fleet":
        return <FleetView stores={stores} />;
      case "staff":
        return <StaffView staff={staff} stores={stores} />;
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
