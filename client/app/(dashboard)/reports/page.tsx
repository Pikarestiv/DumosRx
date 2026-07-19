"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ReportCenter } from "@/components/reports/report-center";
import { BusinessIntelligenceDashboard } from "@/components/analytics/business-intelligence-dashboard";
import { useStore } from "@/lib/context/store-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, TrendingUp } from "lucide-react";
import { useAuth } from "@/lib/context/auth-context";

import { DailyCloseReport } from "@/components/reports/daily-close-report";

export default function ReportsPage() {
  const { t: _t, storeType: _storeType } = useStore();
  const { isAdmin } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const tabParam = searchParams.get("tab");
  const defaultTab = isAdmin ? "reports" : "daily_close";

  const [activeTab, setActiveTab] = useState(() => {
    if (tabParam === "daily_close") return "daily_close";
    if (isAdmin && tabParam === "analytics") return "analytics";
    if (isAdmin && tabParam === "reports") return "reports";
    return defaultTab;
  });

  useEffect(() => {
    if (tabParam) {
      if (tabParam === "daily_close") setActiveTab("daily_close");
      else if (isAdmin && tabParam === "analytics") setActiveTab("analytics");
      else if (isAdmin && tabParam === "reports") setActiveTab("reports");
      else setActiveTab(defaultTab);
    }
  }, [tabParam, isAdmin, defaultTab]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    router.push(`/reports?tab=${value}`, { scroll: false });
  };

  return (
    <>
      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">

      </div>

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="space-y-6"
      >
      <div className="w-full overflow-x-auto scrollbar-none pb-1">
        <TabsList className="w-max bg-muted/50 p-1 flex">
          {isAdmin && (
            <TabsTrigger value="reports" className="gap-2 px-4 py-2 shrink-0">
              <FileText className="w-4 h-4" />
              Operational Reports
            </TabsTrigger>
          )}
          <TabsTrigger value="daily_close" className="gap-2 px-4 py-2 shrink-0">
            <FileText className="w-4 h-4" />
            Daily Close
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="analytics" className="gap-2 px-4 py-2 shrink-0">
              <TrendingUp className="w-4 h-4" />
              Analytics & Insights
            </TabsTrigger>
          )}
        </TabsList>
      </div>

        {isAdmin && (
          <TabsContent value="reports" className="mt-0 border-none p-0">
            <ReportCenter />
          </TabsContent>
        )}

        <TabsContent value="daily_close" className="mt-0 border-none p-0">
          <DailyCloseReport />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="analytics" className="mt-0 border-none p-0">
            <BusinessIntelligenceDashboard />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
