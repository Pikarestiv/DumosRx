"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "lucide-react";
import { useBIData } from "@/lib/hooks/use-bi-data";
import { BIKeyMetrics } from "./bi-key-metrics";
import { inventoryAlerts, customerMetrics } from "./sample-data";
import { SalesAnalyticsTab } from "./sales-analytics-tab";
import { ProfitLossTab } from "./profit-loss-tab";
import { InventoryInsightsTab } from "./inventory-insights-tab";
import { CustomerBehaviorTab } from "./customer-behavior-tab";

export function BusinessIntelligenceDashboard() {
  const [timeRange, setTimeRange] = useState("30d");

  const {
    totalRevenue,
    totalTransactions,
    inventoryValue,
    activeCustomers,
    monthlySalesData,
    topSellingMedicines,
    salesByCategory,
    formattedCategoryData,
    totalCogs,
    totalExpenses,
    grossProfit,
    netProfit,
  } = useBIData(timeRange);

  return (
    <div className="space-y-8 p-1">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Business Intelligence</h1>
          <p className="text-muted-foreground">
            Strategic insights and financial performance metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[180px] bg-white">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 3 months</SelectItem>
              <SelectItem value="1y">Last Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">Export Reports</Button>
        </div>
      </div>

      <BIKeyMetrics
        totalRevenue={totalRevenue}
        totalTransactions={totalTransactions}
        inventoryValue={inventoryValue}
        activeCustomers={activeCustomers}
        netProfit={netProfit}
      />

      {/* Main Analytics Tabs */}
      <Tabs defaultValue="sales" className="space-y-6">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="sales" className="px-6">Sales Analytics</TabsTrigger>
          <TabsTrigger value="profit-loss" className="px-6">Profit & Loss</TabsTrigger>
          <TabsTrigger value="inventory" className="px-6">Inventory Insights</TabsTrigger>
          <TabsTrigger value="customers" className="px-6">Customer Behavior</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-6">
          <SalesAnalyticsTab 
            monthlySalesData={monthlySalesData}
            topSellingMedicines={topSellingMedicines}
            formattedCategoryData={formattedCategoryData}
          />
        </TabsContent>

        <TabsContent value="profit-loss" className="space-y-6">
          <ProfitLossTab 
            totalRevenue={totalRevenue}
            totalCogs={totalCogs}
            totalExpenses={totalExpenses}
            grossProfit={grossProfit}
            netProfit={netProfit}
            monthlySalesData={monthlySalesData}
          />
        </TabsContent>

        <TabsContent value="inventory" className="space-y-6">
          <InventoryInsightsTab 
            inventoryAlerts={inventoryAlerts}
            salesByCategory={salesByCategory}
          />
        </TabsContent>

        <TabsContent value="customers" className="space-y-6">
          <CustomerBehaviorTab 
            customerMetrics={customerMetrics}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
