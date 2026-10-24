import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// "view_financial_reports" is the margin-revealing slice of the Report Center:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-report-center-financial-permission-test-tsx-L4

const hasPermission = vi.fn((_key: string) => true);

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: (key: string) => hasPermission(key),
}));
vi.mock("@/lib/hooks/use-report-export", () => {
  // One stable object: ReportCenter's refreshRecent useCallback depends on
  // getRecentDownloads, so a fresh identity per render loops forever.
  const api = {
    getRows: () => Promise.resolve([]),
    exportReportCsv: async () => {},
    downloadReportPdf: async () => {},
    printReport: async () => {},
    getRecentDownloads: () => [],
  };
  return {
    useReportExport: () => api,
    getReportNote: () => null,
    getReportHeaders: () => [],
  };
});
vi.mock("@/components/reports/report-filters-bar", () => ({
  ReportFiltersBar: () => <div>filters-bar</div>,
}));
vi.mock("@/components/reports/report-view-dialog", () => ({
  ReportViewDialog: () => <div>report-view-dialog</div>,
}));

import { ReportCenter } from "@/components/reports/report-center";

function deny(...denied: string[]) {
  hasPermission.mockImplementation((key: string) => !denied.includes(key));
}

describe("Report Center view_financial_reports permission", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation(() => true);
  });

  it("checks the view_financial_reports key specifically", () => {
    render(<ReportCenter />);
    expect(hasPermission).toHaveBeenCalledWith("view_financial_reports");
  });

  it("offers the Profit & Loss Summary report with the key", () => {
    render(<ReportCenter />);
    expect(screen.queryByText("Profit & Loss Summary")).not.toBeNull();
  });

  it("hides the Profit & Loss Summary report without the key", () => {
    deny("view_financial_reports");
    render(<ReportCenter />);
    expect(screen.queryByText("Profit & Loss Summary")).toBeNull();
  });

  it("keeps every non-financial report without the key", () => {
    deny("view_financial_reports");
    render(<ReportCenter />);
    expect(screen.queryByText("Detailed Sales Report")).not.toBeNull();
    expect(screen.queryByText("Inventory Valuation")).not.toBeNull();
    expect(screen.queryByText("Customer Loyalty Report")).not.toBeNull();
    expect(screen.queryByText("Expense Categories")).not.toBeNull();
    expect(screen.queryByText("Top Sellers")).not.toBeNull();
  });
});
