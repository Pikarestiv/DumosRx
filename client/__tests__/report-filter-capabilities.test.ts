import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/queries/reports", () => ({
  fetchSalesReportData: vi.fn(),
  fetchStockBatchReportData: vi.fn(),
  fetchProfitLossReportData: vi.fn(),
  fetchCustomerReportData: vi.fn(),
  fetchExpensesReportData: vi.fn(),
  fetchTopSellersReportData: vi.fn(),
}));
vi.mock("@/lib/context/store-context", () => ({ useStore: () => ({}) }));

/**
 * The in-modal filter bar renders only the controls a report's query can
 * actually act on, so these two flags are read by the dialog rather than
 * re-derived from a second list that could drift from REPORT_CONFIG.
 */
describe("report filter capabilities", () => {
  it("reports which ids accept a date range", async () => {
    const { reportSupportsDateRange } = await import("@/lib/hooks/use-report-export");
    expect(reportSupportsDateRange("sales")).toBe(true);
    expect(reportSupportsDateRange("profit-loss")).toBe(true);
    expect(reportSupportsDateRange("top_sellers")).toBe(true);
    expect(reportSupportsDateRange("expenses")).toBe(true);
    expect(reportSupportsDateRange("stock_batches")).toBe(false);
    expect(reportSupportsDateRange("customers")).toBe(false);
  });

  it("reports which ids accept staff / payment-method filters", async () => {
    const { reportSupportsSalesFilters } = await import("@/lib/hooks/use-report-export");
    expect(reportSupportsSalesFilters("sales")).toBe(true);
    expect(reportSupportsSalesFilters("profit-loss")).toBe(true);
    expect(reportSupportsSalesFilters("top_sellers")).toBe(true);
    expect(reportSupportsSalesFilters("expenses")).toBe(false);
    expect(reportSupportsSalesFilters("stock_batches")).toBe(false);
    expect(reportSupportsSalesFilters("customers")).toBe(false);
  });
});
