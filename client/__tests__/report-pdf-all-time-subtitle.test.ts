import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { name: "Test Store", uppercase_display_enabled: 0 } }),
}));

vi.mock("@/lib/db/queries/reports", () => ({
  fetchSalesReportData: vi.fn(() => Promise.resolve([{ "Transaction #": "TXN-1" }])),
  fetchStockBatchReportData: vi.fn(() => Promise.resolve([{ Product: "Panadol" }])),
  fetchProfitLossReportData: vi.fn(() => Promise.resolve([])),
  fetchCustomerReportData: vi.fn(() => Promise.resolve([{ Name: "Jane" }])),
  fetchExpensesReportData: vi.fn(() => Promise.resolve([])),
  fetchTopSellersReportData: vi.fn(() => Promise.resolve([])),
}));

const generateReportPdfBlobMock = vi.fn(
  (_input: import("@/lib/utils/report-pdf").ReportPdfInput, _signal?: AbortSignal) =>
    Promise.resolve(new Blob(["pdf"])),
);
vi.mock("@/lib/utils/report-pdf", () => ({
  generateReportPdfBlob: generateReportPdfBlobMock,
}));
vi.mock("@/lib/utils/download-blob", () => ({
  downloadBlob: vi.fn(() => 100),
  openBlobForPrint: vi.fn(),
}));

// Regression test: buildReportPdfBlob stamped a period subtitle onto every PDF whenever dateFrom/dateTo were passed, even…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-report-pdf-all-time-subtitle-test-ts-L29
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
