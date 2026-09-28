"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CalendarIcon } from "lucide-react";
import { ReportCenter } from "@/components/reports/report-center";
import dynamic from "next/dynamic";
import { useStore } from "@/lib/context/store-context";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { getLocalTodayDate } from "@/lib/utils";

import { DailyCloseReport } from "@/components/reports/daily-close-report";
import { ReportsTabNav } from "./reports-tab-nav";
import { LockedModuleOverlay } from "@/components/dashboard/locked-module-overlay";

// All of recharts rides along with this dashboard, and only one Radix tab's
// content renders at a time — so the Analytics tab pays for it when it's
// actually opened, not on every visit to Reports.
const BusinessIntelligenceDashboard = dynamic(
  () =>
    import("@/components/analytics").then((m) => m.BusinessIntelligenceDashboard),
  { ssr: false },
);

export default function ReportsPage() {
  const { t: _t, storeType: _storeType } = useStore();
  const canViewReports = useHasPermission("view_reports");
  const searchParams = useSearchParams();
  const router = useRouter();

  const tabParam = searchParams.get("tab");
  const defaultTab = canViewReports ? "reports" : "daily_close";

  const [activeTab, setActiveTab] = useState(() => {
    if (tabParam === "daily_close") return "daily_close";
    if (canViewReports && tabParam === "analytics") return "analytics";
    if (canViewReports && tabParam === "reports") return "reports";
    return defaultTab;
  });

  const [reportDate, setReportDate] = useState(getLocalTodayDate());

  useEffect(() => {
    if (tabParam) {
      if (tabParam === "daily_close") setActiveTab("daily_close");
      else if (canViewReports && tabParam === "analytics") setActiveTab("analytics");
      else if (canViewReports && tabParam === "reports") setActiveTab("reports");
      else setActiveTab(defaultTab);
    }
  }, [tabParam, canViewReports, defaultTab]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    router.push(`/reports?tab=${value}`, { scroll: false });
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="gap-4">
      {/* The page design has no title slot; a top-level heading is still
          required for screen-reader/landmark navigation (WCAG 1.3.1/2.4.6). */}
      <h1 className="sr-only">Reports</h1>
      <div className="flex flex-col md:flex-row md:items-center gap-2.5">
        <ReportsTabNav />

        {activeTab === "daily_close" && (
          <div className="h-10 flex items-center gap-2 shrink-0 bg-background border rounded-md px-3 shadow-sm">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
              Date:
            </label>
            <DatePickerInput
              value={reportDate}
              onChange={setReportDate}
              disableFuture
              fromYear={new Date().getFullYear() - 5}
              toYear={new Date().getFullYear()}
              className="w-40"
              inputClassName="border-none shadow-none focus-visible:ring-0 px-1"
            />
          </div>
        )}
      </div>

      {canViewReports && (
        <TabsContent value="reports" className="mt-0 border-none p-0">
          <div className="relative w-full h-full min-h-[500px]">
            <LockedModuleOverlay featureName="Advanced Reports" featureKey="advanced_reports" />
            <ReportCenter />
          </div>
        </TabsContent>
      )}

      <TabsContent value="daily_close" className="mt-0 border-none p-0">
        <div className="relative w-full h-full min-h-[500px]">
          <LockedModuleOverlay featureName="Daily Close Report" featureKey="daily_close_report" />
          <DailyCloseReport reportDate={reportDate} />
        </div>
      </TabsContent>

      {canViewReports && (
        <TabsContent value="analytics" className="mt-0 border-none p-0">
          <div className="relative w-full h-full min-h-[500px]">
            <LockedModuleOverlay featureName="Advanced Reports" featureKey="advanced_reports" />
            <BusinessIntelligenceDashboard />
          </div>
        </TabsContent>
      )}
    </Tabs>
  );
}
