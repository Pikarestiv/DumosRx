"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CalendarIcon } from "lucide-react";
import { ReportCenter } from "@/components/reports/report-center";
import { BusinessIntelligenceDashboard } from "@/components/analytics/business-intelligence-dashboard";
import { useStore } from "@/lib/context/store-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/context/auth-context";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { ResponsiveTabLabel } from "@/components/ui/responsive-tab-label";
import { getLocalTodayDate } from "@/lib/utils";

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

  const tabTriggerClass =
    "h-10 px-5 rounded-lg text-[13px] font-semibold gap-1.5 whitespace-nowrap shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground data-[state=inactive]:bg-transparent shadow-none";

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="gap-4">
      <div className="flex flex-col md:flex-row md:items-center gap-2.5">
        <TabsList className="w-full md:w-max inline-flex gap-1 bg-background border rounded-[11px] p-1 h-auto overflow-x-auto">
          {isAdmin && (
            <TabsTrigger value="reports" className={tabTriggerClass}>
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              <ResponsiveTabLabel short="Operational" long="Operational Reports" />
            </TabsTrigger>
          )}
          <TabsTrigger value="daily_close" className={tabTriggerClass}>
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Daily Close
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="analytics" className={tabTriggerClass}>
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M23 6l-9.5 9.5-5-5L1 18" />
              </svg>
              <ResponsiveTabLabel short="Analytics" long="Analytics & Insights" />
            </TabsTrigger>
          )}
        </TabsList>

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
