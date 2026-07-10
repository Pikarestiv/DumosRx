"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStockBatchAlerts } from "./use-stock-batch-alerts";
import { usePurchasePatterns } from "./use-purchase-patterns";
import { useMonthlySalesData } from "./use-monthly-sales-data";
import { getBIMetrics } from "@/lib/db/queries/reports";

export function useBIData(externalTimeRange?: string) {
  const [internalTimeRange, setInternalTimeRange] = useState("6months");
  const timeRange = externalTimeRange || internalTimeRange;

  const { dateFilter, prevDateFilter } = useMemo(() => {
    const now = new Date();
    const filterDate = new Date();
    const prevDate = new Date();

    let days = 30;
    if (timeRange === "7d") days = 7;
    else if (timeRange === "30d") days = 30;
    else if (timeRange === "90d") days = 90;
    else if (timeRange === "1y") days = 365;
    else if (timeRange === "1month") days = 30;
    else if (timeRange === "3months") days = 90;
    else if (timeRange === "6months") days = 180;
    else if (timeRange === "1year") days = 365;

    filterDate.setDate(now.getDate() - days);
    prevDate.setDate(now.getDate() - days * 2);

    return {
      dateFilter: filterDate.toISOString(),
      prevDateFilter: prevDate.toISOString(),
    };
  }, [timeRange]);

  const { data: metrics } = useQuery({
    queryKey: ['biMetrics', dateFilter, prevDateFilter],
    queryFn: () => getBIMetrics(dateFilter, prevDateFilter)
  });

  const totalRevenue = (metrics?.revenueData[0]?.total || 0) - (metrics?.totalRefundsData[0]?.total || 0);
  const totalCogs = (metrics?.cogsData[0]?.total || 0) - (metrics?.returnedCogsData[0]?.total || 0);
  const totalExpenses = metrics?.expensesData[0]?.total || 0;

  const grossProfit = totalRevenue - totalCogs;
  const netProfit = grossProfit - totalExpenses;

  const totalTransactions = metrics?.transactionData[0]?.count || 0;
  const stock_batchValue = metrics?.stock_batchValueData[0]?.value || 0;
  const activeCustomers = metrics?.customerData[0]?.count || 0;
  const loyaltyMembers = metrics?.loyaltyData[0]?.count || 0;

  const retentionRate = useMemo(() => {
    const r = metrics?.retentionData[0];
    if (!r || r.total === 0) return 0;
    return Math.round((r.returning / r.total) * 100);
  }, [metrics?.retentionData]);

  const prevRevenue = metrics?.prevRevenueData[0]?.total || 0;
  const prevTransactions = metrics?.prevTransactionData[0]?.count || 0;
  const prevCustomers = metrics?.prevCustomerData[0]?.count || 0;

  const avgTransactionValue = useMemo(() => {
    return totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
  }, [totalRevenue, totalTransactions]);

  const prevAvgTransaction = useMemo(() => {
    return prevTransactions > 0 ? prevRevenue / prevTransactions : 0;
  }, [prevRevenue, prevTransactions]);

  const pctChange = (current: number, prev: number) => {
    if (prev === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - prev) / prev) * 100 * 10) / 10;
  };

  const revenueChange = pctChange(totalRevenue, prevRevenue);
  const customersThisPeriod = useMemo(() => activeCustomers, [activeCustomers]);
  const customerChange = pctChange(customersThisPeriod, prevCustomers);
  const avgTransactionChange = pctChange(
    avgTransactionValue,
    prevAvgTransaction,
  );

  const monthlySalesData = useMonthlySalesData(dateFilter);

  const topSellingProducts = useMemo(
    () => ({
      revenue: metrics?.topSellingByRevenue || [],
      quantity: metrics?.topSellingByQuantity || [],
    }),
    [metrics?.topSellingByRevenue, metrics?.topSellingByQuantity],
  );

  const colors = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
  const categoryDistribution = metrics?.categoryDistribution || [];
  const formattedCategoryData = useMemo(() => {
    return categoryDistribution.map((item: any, index: number) => ({
      ...item,
      color: colors[index % colors.length],
    }));
  }, [categoryDistribution]);

  const stock_batchAlerts = useStockBatchAlerts();
  const purchasePatterns = usePurchasePatterns(dateFilter);

  const liveCustomerMetrics = useMemo(
    () => [
      {
        metric: "Total Customers",
        value: activeCustomers.toLocaleString(),
        change: `${customerChange >= 0 ? "+" : ""}${customerChange}%`,
        trend: customerChange >= 0 ? "up" : "down",
      },
      {
        metric: "Loyalty Members",
        value: loyaltyMembers.toLocaleString(),
        change:
          loyaltyMembers > 0
            ? `${Math.round((loyaltyMembers / Math.max(activeCustomers, 1)) * 100)}% of total`
            : "0%",
        trend: "up",
      },
      {
        metric: "Avg. Transaction",
        value: `₦${Math.floor(avgTransactionValue).toLocaleString()}`,
        change: `${avgTransactionChange >= 0 ? "+" : ""}${avgTransactionChange}%`,
        trend: avgTransactionChange >= 0 ? "up" : "down",
      },
      {
        metric: "Customer Retention",
        value: `${retentionRate}%`,
        change: retentionRate >= 50 ? "Healthy" : "Needs attention",
        trend: retentionRate >= 50 ? "up" : "down",
      },
    ],
    [
      activeCustomers,
      loyaltyMembers,
      avgTransactionValue,
      avgTransactionChange,
      customerChange,
      retentionRate,
    ],
  );

  return {
    timeRange,
    totalRevenue,
    revenueChange,
    totalCogs,
    totalExpenses,
    grossProfit,
    netProfit,
    totalTransactions,
    avgTransactionValue,
    avgTransactionChange,
    stock_batchValue,
    activeCustomers,
    customerChange,
    loyaltyMembers,
    retentionRate,
    monthlySalesData,
    topSellingProducts,
    formattedCategoryData,
    salesByCategory: categoryDistribution,
    stock_batchAlerts,
    purchasePatterns,
    liveCustomerMetrics,
    setInternalTimeRange,
  };
}
