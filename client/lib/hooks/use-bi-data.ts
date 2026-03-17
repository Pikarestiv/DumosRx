"use client";

import { useState, useMemo } from "react";
import { useLocalData } from "@/lib/db/hooks/useLocalData";

export function useBIData(externalTimeRange?: string) {
  const [internalTimeRange, setInternalTimeRange] = useState("6months");
  const timeRange = externalTimeRange || internalTimeRange;

  const dateFilter = useMemo(() => {
    const now = new Date();
    const filterDate = new Date();
    
    if (timeRange === "7d") filterDate.setDate(now.getDate() - 7);
    else if (timeRange === "30d") filterDate.setDate(now.getDate() - 30);
    else if (timeRange === "90d") filterDate.setMonth(now.getMonth() - 3);
    else if (timeRange === "1y") filterDate.setFullYear(now.getFullYear() - 1);
    else if (timeRange === "1month") filterDate.setMonth(now.getMonth() - 1);
    else if (timeRange === "3months") filterDate.setMonth(now.getMonth() - 3);
    else if (timeRange === "6months") filterDate.setMonth(now.getMonth() - 6);
    else if (timeRange === "1year") filterDate.setFullYear(now.getFullYear() - 1);
    
    return filterDate.toISOString();
  }, [timeRange]);

  // 1. Total Revenue
  const { data: revenueData } = useLocalData<{ total: number }>(
    `SELECT SUM(total_amount) as total FROM sales WHERE transaction_date >= ? AND _deleted = 0`,
    [dateFilter]
  );
  const totalRevenue = revenueData[0]?.total || 0;

  // 1b. Total COGS (Cost of Goods Sold)
  const { data: cogsData } = useLocalData<{ total: number }>(
    `SELECT SUM(cost_price * quantity) as total FROM sale_items si 
     JOIN sales s ON si.sale_id = s.id 
     WHERE s.transaction_date >= ? AND s._deleted = 0`,
    [dateFilter]
  );
  const totalCogs = cogsData[0]?.total || 0;

  // 1c. Total Expenses
  const { data: expensesData } = useLocalData<{ total: number }>(
    `SELECT SUM(amount) as total FROM expenses WHERE date >= ? AND _deleted = 0`,
    [dateFilter]
  );
  const totalExpenses = expensesData[0]?.total || 0;

  const grossProfit = totalRevenue - totalCogs;
  const netProfit = grossProfit - totalExpenses;

  // 2. Total Transactions
  const { data: transactionData } = useLocalData<{ count: number }>(
    `SELECT COUNT(*) as count FROM sales WHERE transaction_date >= ? AND _deleted = 0`,
    [dateFilter]
  );
  const totalTransactions = transactionData[0]?.count || 0;

  // 3. Inventory Value
  const { data: inventoryValueData } = useLocalData<{ value: number }>(
    `SELECT SUM(cost_price * stock_quantity) as value FROM medicines WHERE _deleted = 0`
  );
  const inventoryValue = inventoryValueData[0]?.value || 0;

  // 4. Active Customers
  const { data: customerData } = useLocalData<{ count: number }>(
    `SELECT COUNT(*) as count FROM customers WHERE _deleted = 0`
  );
  const activeCustomers = customerData[0]?.count || 0;

  // 5. Monthly Sales Data (with real profit)
  const { data: rawMonthlyData } = useLocalData<{ month: string, revenue: number, cogs: number, transactions: number }>(
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

  const { data: rawExpenseData } = useLocalData<{ month: string, expenses: number }>(
    `SELECT 
      strftime('%b', date) as month,
      SUM(amount) as expenses
     FROM expenses
     WHERE date >= ? AND _deleted = 0
     GROUP BY strftime('%m', date)`,
    [dateFilter]
  );

  const monthlySalesData = useMemo(() => {
    return rawMonthlyData.map(item => {
      const exp = rawExpenseData.find(e => e.month === item.month)?.expenses || 0;
      return {
        ...item,
        profit: item.revenue - item.cogs - exp,
        expenses: exp
      };
    });
  }, [rawMonthlyData, rawExpenseData]);

  // 6. Top Selling Medicines
  const { data: topSellingMedicines } = useLocalData<{ name: string, sales: number, units: number, category: string }>(
    `SELECT 
      m.name,
      SUM(si.subtotal) as sales,
      SUM(si.quantity) as units,
      m.category
     FROM sale_items si
     JOIN medicines m ON si.medicine_id = m.id
     JOIN sales s ON si.sale_id = s.id
     WHERE s.transaction_date >= ? AND s._deleted = 0
     GROUP BY m.id
     ORDER BY sales DESC
     LIMIT 5`,
    [dateFilter]
  );

  // 7. Sales by Category
  const { data: categoryDistribution } = useLocalData<{ name: string, value: number }>(
    `SELECT 
      m.category as name,
      COUNT(*) as value
     FROM sale_items si
     JOIN medicines m ON si.medicine_id = m.id
     JOIN sales s ON si.sale_id = s.id
     WHERE s.transaction_date >= ? AND s._deleted = 0
     GROUP BY m.category`,
    [dateFilter]
  );

  const colors = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
  const formattedCategoryData = useMemo(() => {
    return categoryDistribution.map((item, index) => ({
      ...item,
      color: colors[index % colors.length]
    }));
  }, [categoryDistribution]);

  return {
    timeRange,
    totalRevenue,
    totalCogs,
    totalExpenses,
    grossProfit,
    netProfit,
    totalTransactions,
    inventoryValue,
    activeCustomers,
    monthlySalesData,
    topSellingMedicines,
    formattedCategoryData,
    salesByCategory: categoryDistribution,
    setInternalTimeRange,
  };
}
