import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * The Analytics dashboard's margin surfaces under "view_financial_reports":
 * the Profit & Loss sub-tab, the Net Profit key metric above it (the same
 * figure, condensed) and the "Export Reports" button, which downloads the
 * profit-loss CSV and nothing else. The other four sub-tabs are operational
 * and stay under view_reports alone.
 */

const hasPermission = vi.fn((_key: string) => true);

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));
vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { currency: "NGN" } }),
}));
vi.mock("@/components/reports/report-filters-bar", () => ({
  ReportFiltersBar: () => <div>filters-bar</div>,
}));
vi.mock("@/components/analytics/sales-analytics-tab", () => ({
  SalesAnalyticsTab: () => <div>sales-panel</div>,
}));
vi.mock("@/components/analytics/profit-loss-tab", () => ({
  ProfitLossTab: () => <div>profit-loss-panel</div>,
}));
vi.mock("@/components/analytics/stock-batch-insights-tab", () => ({
  StockBatchInsightsTab: () => <div>stock-panel</div>,
}));
vi.mock("@/components/analytics/customer-behavior-tab", () => ({
  CustomerBehaviorTab: () => <div>customers-panel</div>,
}));
vi.mock("@/components/analytics/staff-performance-tab", () => ({
  StaffPerformanceTab: () => <div>staff-panel</div>,
}));
vi.mock("@/lib/hooks/use-business-intelligence-dashboard", () => ({
  useBusinessIntelligenceDashboard: () => ({
    filters: { dateRange: { from: "2026-01-01", to: "2026-01-31" } },
    setFilters: vi.fn(),
    activeTab: "sales",
    setActiveTab: vi.fn(),
    exporting: false,
    handleExportReports: vi.fn(async () => {}),
    grossSales: 0,
    netSales: 0,
    totalRevenue: 0,
    totalTransactions: 0,
    stock_batchValue: 0,
    activeCustomers: 0,
    monthlySalesData: [],
    productPerformance: [],
    cashierPerformance: [],
    salesByCategory: [],
    formattedCategoryData: [],
    totalCogs: 0,
    totalExpenses: 0,
    grossProfit: 0,
    netProfit: 0,
    stock_batchAlerts: [],
    purchasePatterns: [],
    liveCustomerMetrics: [],
  }),
}));

import { BusinessIntelligenceDashboard } from "@/components/analytics/business-intelligence-dashboard";

function deny(...denied: string[]) {
  hasPermission.mockImplementation((key: string) => !denied.includes(key));
}

describe("Analytics dashboard view_financial_reports permission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("checks the view_financial_reports key specifically", () => {
    render(<BusinessIntelligenceDashboard />);
    expect(hasPermission).toHaveBeenCalledWith("view_financial_reports");
  });

  it("offers the P&L tab, Net Profit and the export with the key", () => {
    render(<BusinessIntelligenceDashboard />);
    expect(screen.queryByText("Profit & Loss")).not.toBeNull();
    expect(screen.queryByText("Net Profit")).not.toBeNull();
    expect(screen.queryByText("Export Reports")).not.toBeNull();
  });

  it("hides the P&L tab, Net Profit and the export without the key", () => {
    deny("view_financial_reports");
    render(<BusinessIntelligenceDashboard />);
    expect(screen.queryByText("Profit & Loss")).toBeNull();
    expect(screen.queryByText("profit-loss-panel")).toBeNull();
    expect(screen.queryByText("Net Profit")).toBeNull();
    expect(screen.queryByText("Export Reports")).toBeNull();
  });

  it("keeps the operational sub-tabs and metrics without the key", () => {
    deny("view_financial_reports");
    render(<BusinessIntelligenceDashboard />);
    expect(screen.queryByText("Sales Analytics")).not.toBeNull();
    expect(screen.queryByText("Stock Batch Insights")).not.toBeNull();
    expect(screen.queryByText("Customer Behaviour")).not.toBeNull();
    expect(screen.queryByText("Staff Performance")).not.toBeNull();
    expect(screen.queryByText("Net Sales")).not.toBeNull();
    expect(screen.queryByText("Transactions")).not.toBeNull();
  });
});
