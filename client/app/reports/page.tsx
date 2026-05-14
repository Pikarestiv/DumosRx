"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ReportCenter } from "@/components/reports/report-center";
import { BusinessIntelligenceDashboard } from "@/components/analytics/business-intelligence-dashboard";
import { useStore } from "@/lib/context/store-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, FileText, TrendingUp } from "lucide-react";

export default function ReportsPage() {
  const { t, storeType } = useStore();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(tabParam === "analytics" ? "analytics" : "reports");

  useEffect(() => {
    if (tabParam && (tabParam === "reports" || tabParam === "analytics")) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    router.push(`/reports?tab=${value}`, { scroll: false });
  };

  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif font-bold text-3xl text-foreground">
            {activeTab === "reports" ? "Reporting Center" : "Business Intelligence"}
          </h1>
          <p className="text-muted-foreground mt-2">
            {activeTab === "reports" 
              ? `Generate, schedule, and export detailed operational reports for your ${t('store').toLowerCase()}`
              : "Advanced data visualization and trend analysis for your business performance"}
          </p>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="space-y-6"
      >
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="reports" className="gap-2 px-4 py-2">
            <FileText className="w-4 h-4" />
            Operational Reports
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2 px-4 py-2">
            <TrendingUp className="w-4 h-4" />
            Analytics & Insights
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-0 border-none p-0">
          <ReportCenter />
        </TabsContent>

        <TabsContent value="analytics" className="mt-0 border-none p-0">
          <BusinessIntelligenceDashboard />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
