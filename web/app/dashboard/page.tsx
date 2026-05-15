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

export default function DashboardPage() {
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
      <div className="h-screen w-full flex items-center justify-center bg-muted/40">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground animate-pulse">
            Loading your fleet intelligence...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-muted/40 overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        user={user} 
        onLogout={logout} 
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Global Header */}
        <Header onSetActiveTab={setActiveTab} />

        {/* Dynamic View Area */}
        <main className="flex-1 overflow-y-auto p-8 bg-muted/20">
          <div className="max-w-7xl mx-auto">
            {activeTab === "overview" && (
              <OverviewView stats={stats} user={user} stores={stores} onReset={resetAccountData} />
            )}

            {activeTab === "fleet" && (
              <FleetView stores={stores} />
            )}

            {activeTab === "staff" && (
              <StaffView staff={staff} stores={stores} />
            )}

            {activeTab === "billing" && (
              <BillingView />
            )}

            {activeTab === "downloads" && (
              <DownloadsView releaseLinks={releaseLinks} />
            )}

            {activeTab === "notifications" && (
              <NotificationsView onBack={() => setActiveTab("overview")} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
