import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderHook } from "@testing-library/react";

const mockBatchRows = [
  {
    Product: "Paracetamol",
    "Generic Name": "Acetaminophen",
    Form: "Tablet",
    Strength: "500mg",
    "Stock Qty": 100,
    "Reorder Level": 20,
    "Cost Price": "₦50.00",
    "Selling Price": "₦100.00",
    "Stock Value": "₦5,000.00",
    "Nearest Expiry": "12/2027",
  },
];

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({
    storeProfile: { name: "Test Store", uppercase_display_enabled: 0 },
  }),
}));

vi.mock("@/lib/db/queries/reports", () => ({
  fetchSalesReportData: vi.fn(() => Promise.resolve([])),
  fetchStockBatchReportData: vi.fn(() => Promise.resolve(mockBatchRows)),
  fetchProfitLossReportData: vi.fn(() => Promise.resolve([])),
  fetchCustomerReportData: vi.fn(() => Promise.resolve([])),
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

let lastDownloadedCsv = "";
vi.mock("@/lib/utils/download-blob", () => ({
  downloadBlob: vi.fn((blob: Blob) => {
    if (blob.type.includes("csv")) {
      const reader = new FileReader();
      reader.onload = () => {
        lastDownloadedCsv = reader.result as string;
      };
      reader.readAsText(blob);
    }
    return 100;
  }),
  openBlobForPrint: vi.fn(),
}));

let mockPermissions: Record<string, boolean> = {};
vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => mockPermissions[key] ?? true,
}));

vi.mock("@/components/reports/report-filters-bar", () => ({
  ReportFiltersBar: () => React.createElement("div"),
}));

describe("A-383: Inventory Valuation report cost visibility gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastDownloadedCsv = "";
    mockPermissions = {};
  });

  it("filters out Cost Price and Stock Value from getReportHeaders when canViewCost is false", async () => {
    const { getReportHeaders } = await import("@/lib/hooks/use-report-export");

    const headersWithCost = getReportHeaders("stock_batches", true);
    expect(headersWithCost).toContain("Cost Price");
    expect(headersWithCost).toContain("Stock Value");

    const headersWithoutCost = getReportHeaders("stock_batches", false);
    expect(headersWithoutCost).not.toContain("Cost Price");
    expect(headersWithoutCost).not.toContain("Stock Value");
    expect(headersWithoutCost).toContain("Product");
    expect(headersWithoutCost).toContain("Selling Price");
  });

  it("strips cost fields from rows when useReportExport is called with canViewCost: false", async () => {
    const { useReportExport } = await import("@/lib/hooks/use-report-export");
    const { result } = renderHook(() => useReportExport({ canViewCost: false }));

    const rows = await result.current.getRows("stock_batches");
    expect(rows).toHaveLength(1);
    expect(rows[0]["Cost Price"]).toBeUndefined();
    expect(rows[0]["Stock Value"]).toBeUndefined();
    expect(rows[0]["Product"]).toBe("Paracetamol");
    expect(rows[0]["Selling Price"]).toBe("₦100.00");
  });

  it("preserves cost fields in rows when useReportExport has canViewCost: true", async () => {
    const { useReportExport } = await import("@/lib/hooks/use-report-export");
    const { result } = renderHook(() => useReportExport({ canViewCost: true }));

    const rows = await result.current.getRows("stock_batches");
    expect(rows).toHaveLength(1);
    expect(rows[0]["Cost Price"]).toBe("₦50.00");
    expect(rows[0]["Stock Value"]).toBe("₦5,000.00");
  });

  it("omits cost headers and figures from PDF export when canViewCost: false", async () => {
    const { useReportExport } = await import("@/lib/hooks/use-report-export");
    const { result } = renderHook(() => useReportExport({ canViewCost: false }));

    await result.current.downloadReportPdf("stock_batches");

    expect(generateReportPdfBlobMock).toHaveBeenCalledTimes(1);
    const pdfInput = generateReportPdfBlobMock.mock.calls[0][0];
    expect(pdfInput.headers).not.toContain("Cost Price");
    expect(pdfInput.headers).not.toContain("Stock Value");
    expect(pdfInput.rows[0]["Cost Price"]).toBeUndefined();
    expect(pdfInput.rows[0]["Stock Value"]).toBeUndefined();
  });

  it("updates ReportCenter card title and description when view_cost_fields is withheld", async () => {
    mockPermissions = {
      view_cost_fields: false,
      export_reports: true,
      view_financial_reports: true,
    };

    const { ReportCenter } = await import("@/components/reports/report-center");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(() => {
      root.render(React.createElement(ReportCenter));
      return Promise.resolve();
    });

    const cardTitles = Array.from(container.querySelectorAll("h3")).map((h) => h.textContent?.trim());
    expect(cardTitles).toContain("Stock Levels");
    expect(cardTitles).not.toContain("Inventory Valuation");

    const textContent = container.textContent || "";
    expect(textContent).toContain("Current stock levels and potential selling value.");
    expect(textContent).not.toContain("cost value");

    act(() => root.unmount());
    container.remove();
  }, 15000);

  it("displays Inventory Valuation title when view_cost_fields is granted", async () => {
    mockPermissions = {
      view_cost_fields: true,
      export_reports: true,
      view_financial_reports: true,
    };

    const { ReportCenter } = await import("@/components/reports/report-center");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    await act(() => {
      root.render(React.createElement(ReportCenter));
      return Promise.resolve();
    });

    const cardTitles = Array.from(container.querySelectorAll("h3")).map((h) => h.textContent?.trim());
    expect(cardTitles).toContain("Inventory Valuation");
    expect(cardTitles).not.toContain("Stock Levels");

    act(() => root.unmount());
    container.remove();
  }, 15000);
});
