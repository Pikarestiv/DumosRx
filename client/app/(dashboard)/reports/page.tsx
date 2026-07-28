"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CalendarIcon } from "lucide-react";
import { ReportCenter } from "@/components/reports/report-center";
import { BusinessIntelligenceDashboard } from "@/components/analytics/business-intelligence-dashboard";
import { useStore } from "@/lib/context/store-context";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/lib/context/auth-context";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { getLocalTodayDate } from "@/lib/utils";

import { DailyCloseReport } from "@/components/reports/daily-close-report";
import { ReportsTabNav } from "./reports-tab-nav";

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

  const [reportDate, setReportDate] = useState(getLocalTodayDate());

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
    <Tabs value={activeTab} onValueChange={handleTabChange} className="gap-4">
      <div className="flex flex-col md:flex-row md:items-center gap-2.5">
        <ReportsTabNav isAdmin={isAdmin} />

        {activeTab === "daily_close" && (
          <div className="h-10 flex items-center gap-2 shrink-0 bg-background border rounded-md px-3 shadow-sm">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
              Date:
            </label>
            <DatePickerInput
              value={reportDate}
              onChange={setReportDate}
              className="w-40 border-none shadow-none focus-visible:ring-0 px-1"
            />
          </div>
        )}
      </div>

      {isAdmin && (
        <TabsContent value="reports" className="mt-0 border-none p-0">
          <ReportCenter />
        </TabsContent>
      )}

      <TabsContent value="daily_close" className="mt-0 border-none p-0">
        <DailyCloseReport reportDate={reportDate} />
      </TabsContent>

      {isAdmin && (
        <TabsContent value="analytics" className="mt-0 border-none p-0">
          <BusinessIntelligenceDashboard />
        </TabsContent>
      )}
    </Tabs>
  );
}
