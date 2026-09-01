"use client";

import { useMemo } from "react";
import { subDays } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { useStockBatchAlerts } from "./use-stock-batch-alerts";
import { usePurchasePatterns } from "./use-purchase-patterns";
import { useMonthlySalesData } from "./use-monthly-sales-data";
import { getBIMetrics, type SalesFilters } from "@/lib/db/queries/reports";
import { queryKeys } from "@/lib/query-keys";
import { formatCurrency } from "@/lib/utils";
import { useStore } from "@/lib/context/store-context";
import type { DateRangeValue } from "@/components/ui/date-range-picker";

/** @param dateRange - defaults to the last 180 days when `from` is unset.
 * The previous-period comparison window is the same length immediately
 * before `from` (e.g. a 30-day range compares against the 30 days before
 * that), matching the old fixed-bucket behavior this replaces. */
export function useBIData(dateRange?: DateRangeValue, filters?: SalesFilters) {
  const { storeProfile } = useStore();
  const currencyCode = storeProfile?.currency;

  const { dateFilter, prevDateFilter } = useMemo(() => {
    const now = new Date();
    const from = dateRange?.from ? new Date(dateRange.from) : subDays(now, 180);
    const windowMs = Math.max(now.getTime() - from.getTime(), 1);
    const prev = new Date(from.getTime() - windowMs);
    return {
      dateFilter: from.toISOString(),
      prevDateFilter: prev.toISOString(),
    };
  }, [dateRange?.from]);

  const { data: metrics } = useQuery({
    ...queryKeys.bi.metrics(dateFilter, prevDateFilter, filters?.staffId, filters?.paymentMethod),
    queryFn: () => getBIMetrics(dateFilter, prevDateFilter, filters)
  });

  // Gross Sales: list-price total before discount, tax, or refunds.
  const grossSales = metrics?.grossSalesData[0]?.total || 0;
  const totalTax = metrics?.taxData[0]?.total || 0;
  const totalRefunds = metrics?.totalRefundsData[0]?.total || 0;
  // Net Sales: what the business actually keeps after discounts (already
  // baked into total_amount), tax collected on the government's behalf
  // (not real revenue), and refunds.
  const netSales = (metrics?.revenueData[0]?.total || 0) - totalTax - totalRefunds;
  // totalRevenue kept as an alias for netSales, not a separate tax-inclusive
  // figure: every consumer of this hook (BIKeyMetrics' "Total Revenue" card,
  // avg-transaction-value, revenue-change %) should read the corrected,
  // tax-excluded number now, not the old tax-inclusive one.
  const totalRevenue = netSales;
  const totalCogs = (metrics?.cogsData[0]?.total || 0) - (metrics?.returnedCogsData[0]?.total || 0);
  const totalExpenses = metrics?.expensesData[0]?.total || 0;

  const grossProfit = netSales - totalCogs;
  const netProfit = grossProfit - totalExpenses;

  const totalTransactions = metrics?.transactionData[0]?.count || 0;
  const stock_batchValue = metrics?.stock_batchValueData[0]?.value || 0;
  const activeCustomers = metrics?.customerData[0]?.count || 0;
  const loyaltyMembers = metrics?.loyaltyData[0]?.count || 0;

  const retentionRate = useMemo(() => {
    const r = metrics?.retentionData[0];
    if (!r || r.total === 0) return 0;
    return Math.round((r.returning_count / r.total) * 100);
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

  const monthlySalesData = useMonthlySalesData(dateFilter, filters);

  const topSellingProducts = useMemo(
    () => ({
      revenue: metrics?.topSellingByRevenue || [],
      quantity: metrics?.topSellingByQuantity || [],
    }),
    [metrics?.topSellingByRevenue, metrics?.topSellingByQuantity],
  );

  const productPerformance = useMemo(
    () =>
      (metrics?.productPerformance || []).map((p) => ({
        ...p,
        margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue) * 100 : 0,
      })),
    [metrics?.productPerformance],
  );

  const cashierPerformance = useMemo(
    () =>
      (metrics?.cashierPerformance || []).map((c) => ({
        ...c,
        avgTransaction:
          c.transactionCount > 0 ? c.totalSales / c.transactionCount : 0,
      })),
    [metrics?.cashierPerformance],
  );

  const colors = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
  const categoryDistribution = metrics?.categoryDistribution || [];
  const formattedCategoryData = useMemo(() => {
    return categoryDistribution.map((item, index) => ({
      ...item,
      color: colors[index % colors.length],
    }));
  }, [categoryDistribution]);

  const stock_batchAlerts = useStockBatchAlerts();
  const purchasePatterns = usePurchasePatterns(dateFilter, filters);

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
        value: formatCurrency(Math.floor(avgTransactionValue), currencyCode),
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
    grossSales,
    netSales,
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
    productPerformance,
    cashierPerformance,
    formattedCategoryData,
    salesByCategory: categoryDistribution,
    stock_batchAlerts,
    purchasePatterns,
    liveCustomerMetrics,
  };
}
