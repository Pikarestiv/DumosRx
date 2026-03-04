"use client";

import { useState, useMemo } from "react";
import { useLocalData } from "@/lib/db/hooks/useLocalData";

export function useBIData() {
  const [timeRange, setTimeRange] = useState("6months");

  const dateFilter = useMemo(() => {
    const now = new Date();
    const filterDate = new Date();
    
    if (timeRange === "1month") filterDate.setMonth(now.getMonth() - 1);
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

  // 2. Total Transactions
  const { data: transactionData } = useLocalData<{ count: number }>(
    `SELECT COUNT(*) as count FROM sales WHERE transaction_date >= ? AND _deleted = 0`,
    [dateFilter]
  );
  const totalTransactions = transactionData[0]?.count || 0;

  // 3. Inventory Value
  const { data: inventoryValueData } = useLocalData<{ value: number }>(
    `SELECT SUM(selling_price * stock_quantity) as value FROM medicines WHERE _deleted = 0`
  );
  const inventoryValue = inventoryValueData[0]?.value || 0;

  // 4. Active Customers
  const { data: customerData } = useLocalData<{ count: number }>(
    `SELECT COUNT(*) as count FROM customers WHERE _deleted = 0`
  );
  const activeCustomers = customerData[0]?.count || 0;

  // 5. Monthly Sales Data
  const { data: monthlySalesData } = useLocalData<{ month: string, revenue: number, profit: number }>(
    `SELECT 
      strftime('%b', transaction_date) as month,
      SUM(total_amount) as revenue,
      SUM(total_amount * 0.25) as profit
     FROM sales 
     WHERE transaction_date >= ? AND _deleted = 0
     GROUP BY strftime('%m', transaction_date)
     ORDER BY strftime('%m', transaction_date) ASC`,
    [dateFilter]
  );

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
    setTimeRange,
    totalRevenue,
    totalTransactions,
    inventoryValue,
    activeCustomers,
    monthlySalesData,
    topSellingMedicines,
    formattedCategoryData,
  };
}
