"use client";

import { useState } from "react";
import { subDays } from "date-fns";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Download } from "lucide-react";
import { useBIData } from "@/lib/hooks/use-bi-data";
import { useReportExport } from "@/lib/hooks/use-report-export";
import { BIKeyMetrics } from "./bi-key-metrics";
import { SalesAnalyticsTab } from "./sales-analytics-tab";
import { ProfitLossTab } from "./profit-loss-tab";
import { StockBatchInsightsTab } from "./stock-batch-insights-tab";
import { CustomerBehaviorTab } from "./customer-behavior-tab";

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
        <div className="w-full md:w-max inline-flex gap-1 bg-background border rounded-[11px] p-1 overflow-x-auto">
          <TabsList className="bg-transparent border-none !shadow-none p-0 flex space-x-1 h-auto">
            <TabsTrigger
              value="sales"
              className="px-4 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:hover:text-primary"
            >
              <span className="md:hidden">Sales</span>
              <span className="hidden md:inline">Sales Analytics</span>
            </TabsTrigger>
            <TabsTrigger
              value="profit-loss"
              className="px-4 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:hover:text-primary"
            >
              <span className="md:hidden">P&amp;L</span>
              <span className="hidden md:inline">Profit & Loss</span>
            </TabsTrigger>
            <TabsTrigger
              value="stock_batches"
              className="px-4 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:hover:text-primary"
            >
              <span className="md:hidden">Stock</span>
              <span className="hidden md:inline">Stock Batch Insights</span>
            </TabsTrigger>
            <TabsTrigger
              value="customers"
              className="px-4 py-2 rounded-lg text-[13px] font-semibold whitespace-nowrap shrink-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-primary/10 data-[state=inactive]:hover:text-primary"
            >
              <span className="md:hidden">Customers</span>
              <span className="hidden md:inline">Customer Behavior</span>
            </TabsTrigger>
          </TabsList>
        </div>

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
