import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { name: "Test Store", uppercase_display_enabled: 0 } }),
}));

vi.mock("@/lib/db/queries/reports", () => ({
  fetchSalesReportData: vi.fn(async () => [{ "Transaction #": "TXN-1" }]),
  fetchStockBatchReportData: vi.fn(async () => [{ Product: "Panadol" }]),
  fetchProfitLossReportData: vi.fn(async () => []),
  fetchCustomerReportData: vi.fn(async () => [{ Name: "Jane" }]),
  fetchExpensesReportData: vi.fn(async () => []),
  fetchTopSellersReportData: vi.fn(async () => []),
}));

const generateReportPdfBlobMock = vi.fn(async () => new Blob(["pdf"]));
vi.mock("@/lib/utils/report-pdf", () => ({
  generateReportPdfBlob: generateReportPdfBlobMock,
  downloadBlob: vi.fn(() => 100),
  openBlobForPrint: vi.fn(),
}));

/**
 * Regression test: buildReportPdfBlob stamped a period subtitle onto every
 * PDF whenever dateFrom/dateTo were passed, even for reports configured
 * takesDateRange: false (stock_batches, customers) that are always all-time
 * and never actually filter by that range - mislabeling all-time data as
 * scoped to a period it was never filtered by.
 */
describe("useReportExport PDF subtitle", () => {
  beforeEach(() => {
    generateReportPdfBlobMock.mockClear();
  });

  it("omits the date-range subtitle for a takesDateRange:false report even when dates are passed", async () => {
    const { useReportExport } = await import("@/lib/hooks/use-report-export");
    const { result } = renderHook(() => useReportExport());

    await act(async () => {
      await result.current.downloadReportPdf("stock_batches", "2026-01-01", "2026-01-31");
    });

    expect(generateReportPdfBlobMock).toHaveBeenCalledTimes(1);
    expect(generateReportPdfBlobMock.mock.calls[0][0].subtitle).toBeUndefined();
  });

  it("omits the date-range subtitle for the customers report too", async () => {
    const { useReportExport } = await import("@/lib/hooks/use-report-export");
    const { result } = renderHook(() => useReportExport());

    await act(async () => {
      await result.current.downloadReportPdf("customers", "2026-01-01", "2026-01-31");
    });

    expect(generateReportPdfBlobMock.mock.calls[0][0].subtitle).toBeUndefined();
  });

  it("still includes the date-range subtitle for a takesDateRange:true report", async () => {
    const { useReportExport } = await import("@/lib/hooks/use-report-export");
    const { result } = renderHook(() => useReportExport());

    await act(async () => {
      await result.current.downloadReportPdf("sales", "2026-01-01", "2026-01-31");
    });

    expect(generateReportPdfBlobMock.mock.calls[0][0].subtitle).toBe("01/01/2026 – 31/01/2026");
  });
});
