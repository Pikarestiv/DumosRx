"use client";

import { useState } from "react";
import { subDays } from "date-fns";
import { toast } from "sonner";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Calendar, Download } from "lucide-react";
import { useBIData } from "@/lib/hooks/use-bi-data";
import { useReportExport } from "@/lib/hooks/use-report-export";
import { BIKeyMetrics } from "./bi-key-metrics";
import { SalesAnalyticsTab } from "./sales-analytics-tab";
import { ProfitLossTab } from "./profit-loss-tab";
import { StockBatchInsightsTab } from "./stock-batch-insights-tab";
import { CustomerBehaviorTab } from "./customer-behavior-tab";
import { AnalyticsTabNav } from "./analytics-tab-nav";

const TIME_RANGE_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

export function BusinessIntelligenceDashboard() {
  const [timeRange, setTimeRange] = useState("30d");
  const [exporting, setExporting] = useState(false);
  const { exportProfitLossReport } = useReportExport();

  const handleExportReports = async () => {
    setExporting(true);
    try {
      const days = TIME_RANGE_DAYS[timeRange] ?? 30;
      const to = new Date().toISOString();
      const from = subDays(new Date(), days).toISOString();
      await exportProfitLossReport(from, to);
      toast.success("Export successful", {
        description: "Your report has been downloaded.",
      });
    } catch (err) {
      console.error(err);
      toast.error("Export failed", {
        description: "Something went wrong generating the report.",
      });
    } finally {
      setExporting(false);
    }
  };

  const {
    totalRevenue,
    totalTransactions,
    stock_batchValue,
    activeCustomers,
    monthlySalesData,
    topSellingProducts,
    salesByCategory,
    formattedCategoryData,
    totalCogs,
    totalExpenses,
    grossProfit,
    netProfit,
    stock_batchAlerts,
    purchasePatterns,
    liveCustomerMetrics,
  } = useBIData(timeRange);

  return (
    <div className="space-y-5 p-1">
      <div className="flex flex-col md:flex-row md:items-center gap-2.5">
        <div className="flex items-center gap-2 bg-background border rounded-[10px] px-3.5 py-2.5 w-[220px]">
          <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
          <select
            className="border-0 outline-none text-[13px] w-full bg-transparent appearance-none"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 3 months</option>
            <option value="1y">Last Year</option>
          </select>
        </div>
        <button
          onClick={handleExportReports}
          disabled={exporting}
          className="flex items-center gap-1.5 border bg-background text-foreground text-[13px] font-semibold px-4 py-2.5 rounded-[10px] cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {exporting ? "Exporting..." : "Export Reports"}
        </button>
      </div>

      <BIKeyMetrics
        totalRevenue={totalRevenue}
        totalTransactions={totalTransactions}
        stock_batchValue={stock_batchValue}
        activeCustomers={activeCustomers}
        netProfit={netProfit}
      />

      {/* Main Analytics Tabs */}
      <Tabs defaultValue="sales" className="space-y-5">
        <AnalyticsTabNav />

        <TabsContent value="sales" className="space-y-6 mt-0">
          <SalesAnalyticsTab
            monthlySalesData={monthlySalesData}
            topSellingProducts={topSellingProducts}
            formattedCategoryData={formattedCategoryData}
          />
        </TabsContent>

        <TabsContent value="profit-loss" className="space-y-6 mt-0">
          <ProfitLossTab
            totalRevenue={totalRevenue}
            totalCogs={totalCogs}
            totalExpenses={totalExpenses}
            grossProfit={grossProfit}
            netProfit={netProfit}
            monthlySalesData={monthlySalesData}
          />
        </TabsContent>

        <TabsContent value="stock_batches" className="space-y-6 mt-0">
          <StockBatchInsightsTab
            stock_batchAlerts={stock_batchAlerts}
            salesByCategory={salesByCategory}
          />
        </TabsContent>

        <TabsContent value="customers" className="space-y-6 mt-0">
          <CustomerBehaviorTab
            customerMetrics={liveCustomerMetrics}
            purchasePatterns={purchasePatterns}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
