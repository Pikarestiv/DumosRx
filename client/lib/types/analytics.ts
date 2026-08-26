/** A single point in the 6-month revenue/profit trend, returned by
 * useMonthlySalesData() and consumed by the analytics charts. */
export interface MonthlySalesDataPoint {
  month: string;
  revenue: number;
  profit: number;
  grossProfit: number;
  expenses: number;
  transactions: number;
}

/** A top-selling product row, returned by getBIMetrics()'s
 * topSellingByRevenue/topSellingByQuantity queries. */
export interface TopSellingProduct {
  name: string;
  sales: number;
  units: number;
  category: string;
}

/** A category's share of revenue, returned by getBIMetrics()'s
 * categoryDistribution query; `color` is assigned client-side for charting. */
export interface CategoryDistributionItem {
  name: string;
  value: number;
  color?: string;
}
