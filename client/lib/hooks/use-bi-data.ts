"use client";

import { useState, useMemo } from "react";
import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { useInventoryAlerts } from "./use-inventory-alerts";
import { usePurchasePatterns } from "./use-purchase-patterns";

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

  // ─── Current Period ────────────────────────────────────────────────────────

  // 1. Total Revenue
  const { data: revenueData } = useLocalData<{ total: number }>(
    `SELECT SUM(total_amount) as total FROM sales WHERE transaction_date >= ? AND _deleted = 0`,
    [dateFilter]
  );
  const totalRevenue = revenueData[0]?.total || 0;

  // 2. Total COGS
  const { data: cogsData } = useLocalData<{ total: number }>(
    `SELECT SUM(si.cost_price * si.quantity) as total FROM sale_items si
     JOIN sales s ON si.sale_id = s.id
     WHERE s.transaction_date >= ? AND s._deleted = 0`,
    [dateFilter]
  );
  const totalCogs = cogsData[0]?.total || 0;

  // 3. Total Expenses
  const { data: expensesData } = useLocalData<{ total: number }>(
    `SELECT SUM(amount) as total FROM expenses WHERE date >= ? AND _deleted = 0`,
    [dateFilter]
  );
  const totalExpenses = expensesData[0]?.total || 0;

  const grossProfit = totalRevenue - totalCogs;
  const netProfit = grossProfit - totalExpenses;

  // 4. Total Transactions
  const { data: transactionData } = useLocalData<{ count: number }>(
    `SELECT COUNT(*) as count FROM sales WHERE transaction_date >= ? AND _deleted = 0`,
    [dateFilter]
  );
  const totalTransactions = transactionData[0]?.count || 0;

  // 5. Inventory Value (local uses quantity column)
  const { data: inventoryValueData } = useLocalData<{ value: number }>(
    `SELECT SUM(inv.cost_price * inv.quantity) as value
     FROM inventory inv WHERE inv._deleted = 0`
  );
  const inventoryValue = inventoryValueData[0]?.value || 0;

  // 6. Active Customers
  const { data: customerData } = useLocalData<{ count: number }>(
    `SELECT COUNT(*) as count FROM customers WHERE _deleted = 0`
  );
  const activeCustomers = customerData[0]?.count || 0;

  // 7. Loyalty Members
  const { data: loyaltyData } = useLocalData<{ count: number }>(
    `SELECT COUNT(*) as count FROM customers WHERE loyalty_points > 0 AND _deleted = 0`
  );
  const loyaltyMembers = loyaltyData[0]?.count || 0;

  // 8. Customer Retention (customers who purchased more than once in the period)
  const { data: retentionData } = useLocalData<{ returning: number; total: number }>(
    `SELECT
      COUNT(DISTINCT CASE WHEN cnt > 1 THEN customer_id END) as returning,
      COUNT(DISTINCT customer_id) as total
     FROM (
       SELECT customer_id, COUNT(*) as cnt
       FROM sales
       WHERE transaction_date >= ? AND _deleted = 0 AND customer_id IS NOT NULL
       GROUP BY customer_id
     )`,
    [dateFilter]
  );
  const retentionRate = useMemo(() => {
    const r = retentionData[0];
    if (!r || r.total === 0) return 0;
    return Math.round((r.returning / r.total) * 100);
  }, [retentionData]);

  // ─── Previous Period (for % change) ────────────────────────────────────────

  const { data: prevRevenueData } = useLocalData<{ total: number }>(
    `SELECT SUM(total_amount) as total FROM sales
     WHERE transaction_date >= ? AND transaction_date < ? AND _deleted = 0`,
    [prevDateFilter, dateFilter]
  );
  const prevRevenue = prevRevenueData[0]?.total || 0;

  const { data: prevTransactionData } = useLocalData<{ count: number }>(
    `SELECT COUNT(*) as count FROM sales
     WHERE transaction_date >= ? AND transaction_date < ? AND _deleted = 0`,
    [prevDateFilter, dateFilter]
  );
  const prevTransactions = prevTransactionData[0]?.count || 0;

  const { data: prevCustomerData } = useLocalData<{ count: number }>(
    `SELECT COUNT(*) as count FROM customers
     WHERE created_at >= ? AND created_at < ? AND _deleted = 0`,
    [prevDateFilter, dateFilter]
  );
  const prevCustomers = prevCustomerData[0]?.count || 0;

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
  const customersThisPeriod = useMemo(() => {
    // customers created in current period
    return activeCustomers;
  }, [activeCustomers]);
  const customerChange = pctChange(customersThisPeriod, prevCustomers);
  const avgTransactionChange = pctChange(avgTransactionValue, prevAvgTransaction);

  // ─── Monthly Sales Chart Data ──────────────────────────────────────────────

  const { data: rawMonthlyData } = useLocalData<{
    month: string;
    revenue: number;
    cogs: number;
    transactions: number;
  }>(
    `SELECT
      strftime('%b', s.transaction_date) as month,
      SUM(s.total_amount) as revenue,
      SUM(si.cost_price * si.quantity) as cogs,
      COUNT(DISTINCT s.id) as transactions
     FROM sales s
     LEFT JOIN sale_items si ON s.id = si.sale_id
     WHERE s.transaction_date >= ? AND s._deleted = 0
     GROUP BY strftime('%m', s.transaction_date)
     ORDER BY strftime('%m', s.transaction_date) ASC`,
    [dateFilter]
  );

  const { data: rawExpenseData } = useLocalData<{ month: string; expenses: number }>(
    `SELECT
      strftime('%b', date) as month,
      SUM(amount) as expenses
     FROM expenses
     WHERE date >= ? AND _deleted = 0
     GROUP BY strftime('%m', date)`,
    [dateFilter]
  );

  const monthlySalesData = useMemo(() => {
    return rawMonthlyData.map((item) => {
      const exp = rawExpenseData.find((e) => e.month === item.month)?.expenses || 0;
      return {
        ...item,
        profit: item.revenue - item.cogs - exp,
        expenses: exp,
      };
    });
  }, [rawMonthlyData, rawExpenseData]);

  // ─── Top Selling Medicines ─────────────────────────────────────────────────

  const { data: topSellingMedicines } = useLocalData<{
    name: string;
    sales: number;
    units: number;
    category: string;
  }>(
    `SELECT
      m.name,
      SUM(si.total_price) as sales,
      SUM(si.quantity) as units,
      m.category_id as category
     FROM sale_items si
     JOIN medicines m ON si.medicine_id = m.id
     JOIN sales s ON si.sale_id = s.id
     WHERE s.transaction_date >= ? AND s._deleted = 0
     GROUP BY m.id
     ORDER BY sales DESC
     LIMIT 5`,
    [dateFilter]
  );

  // ─── Sales by Category ─────────────────────────────────────────────────────

  const { data: categoryDistribution } = useLocalData<{ name: string; value: number }>(
    `SELECT
      COALESCE(c.name, 'Uncategorized') as name,
      COUNT(*) as value
     FROM sale_items si
     JOIN medicines m ON si.medicine_id = m.id
     LEFT JOIN categories c ON m.category_id = c.id
     JOIN sales s ON si.sale_id = s.id
     WHERE s.transaction_date >= ? AND s._deleted = 0
     GROUP BY m.category_id`,
    [dateFilter]
  );

  const colors = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
  const formattedCategoryData = useMemo(() => {
    return categoryDistribution.map((item, index) => ({
      ...item,
      color: colors[index % colors.length],
    }));
  }, [categoryDistribution]);

  // ─── Inventory Alerts ─────────────────────────────────────────────────────

  const inventoryAlerts = useInventoryAlerts();

  // ─── Customer Purchase Patterns by Time Slot ──────────────────────────────

  const purchasePatterns = usePurchasePatterns(dateFilter);

  // ─── Customer Metrics with Real Changes ──────────────────────────────────

  const liveCustomerMetrics = useMemo(() => [
    {
      metric: "Total Customers",
      value: activeCustomers.toLocaleString(),
      change: `${customerChange >= 0 ? "+" : ""}${customerChange}%`,
      trend: customerChange >= 0 ? "up" : "down",
    },
    {
      metric: "Loyalty Members",
      value: loyaltyMembers.toLocaleString(),
      change: loyaltyMembers > 0 ? `${Math.round((loyaltyMembers / Math.max(activeCustomers, 1)) * 100)}% of total` : "0%",
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
  ], [activeCustomers, loyaltyMembers, avgTransactionValue, avgTransactionChange, customerChange, retentionRate]);

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
    inventoryValue,
    activeCustomers,
    customerChange,
    loyaltyMembers,
    retentionRate,
    monthlySalesData,
    topSellingMedicines,
    formattedCategoryData,
    salesByCategory: categoryDistribution,
    inventoryAlerts,
    purchasePatterns,
    liveCustomerMetrics,
    setInternalTimeRange,
  };
}
