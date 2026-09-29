import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

import type { ReportFiltersValue } from "@/components/reports/report-filters-bar";
import type { ReportId } from "@/lib/hooks/use-report-export";

const DATE_REPORTS = ["sales", "profit-loss", "top_sellers", "expenses"];
const SALES_FILTER_REPORTS = ["sales", "profit-loss", "top_sellers"];

vi.mock("@/lib/hooks/use-report-export", () => ({
  getReportNote: () => undefined,
  reportSupportsDateRange: (id: string) => DATE_REPORTS.includes(id),
  reportSupportsSalesFilters: (id: string) => SALES_FILTER_REPORTS.includes(id),
}));

// The modal chrome itself is Radix + a media query; the behaviour under test
// is what the dialog renders inside it, so it is flattened to a plain div.
vi.mock("@/components/ui/responsive-modal", () => ({
  ResponsiveModal: ({
    open,
    title,
    description,
    children,
    footer,
  }: {
    open: boolean;
    title: React.ReactNode;
    description?: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) =>
    open ? (
      <div>
        <div>{title}</div>
        <div data-testid="modal-description">{description}</div>
        {children}
        {footer}
      </div>
    ) : null,
}));

vi.mock("@/components/ui/date-range-picker", () => ({
  DateRangePicker: ({
    onChange,
  }: {
    onChange: (value: { from: string; to: string }) => void;
  }) => (
    <button
      data-testid="date-range"
      onClick={() => onChange({ from: "2026-01-01", to: "2026-01-31" })}
    >
      date-range
    </button>
  ),
}));

vi.mock("@/components/reports/staff-select", () => ({
  StaffSelect: ({ value, onChange }: { value?: string; onChange: (v?: string) => void }) => (
    <button data-testid="staff-select" onClick={() => onChange("staff-9")}>
      {`staff:${value ?? "all"}`}
    </button>
  ),
}));

vi.mock("@/components/reports/payment-method-select", () => ({
  PaymentMethodSelect: ({
    value,
    onChange,
  }: {
    value?: string;
    onChange: (v?: string) => void;
  }) => (
    <button data-testid="payment-select" onClick={() => onChange("card")}>
      {`payment:${value ?? "all"}`}
    </button>
  ),
}));

import { ReportViewDialog } from "@/components/reports/report-view-dialog";

const rows = [
  { Cashier: "Ada Obi", Total: 900 },
  { Cashier: "Chidi Nwosu", Total: 1200 },
  { Cashier: "Bola Ade", Total: 80 },
];

const baseFilters: ReportFiltersValue = {
  dateRange: { from: "2026-09-01", to: "2026-09-29" },
};

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof ReportViewDialog>> = {},
) {
  const onFiltersChange = vi.fn();
  const utils = render(
    <ReportViewDialog
      open
      onOpenChange={() => {}}
      reportId={"sales" as ReportId}
      title="Detailed Sales Report"
      rows={rows}
      headers={["Cashier", "Total"]}
      initialFilters={baseFilters}
      onFiltersChange={onFiltersChange}
      isLoading={false}
      isExporting={false}
      onExport={() => {}}
      {...overrides}
    />,
  );
  return { ...utils, onFiltersChange };
}

const bodyRowCount = () => screen.getAllByRole("row").length - 1;

describe("ReportViewDialog in-modal search", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filters the already-fetched rows client-side without asking for a re-fetch", () => {
    const { onFiltersChange } = renderDialog();

    fireEvent.change(screen.getByRole("textbox", { name: /search/i }), {
      target: { value: "Chidi" },
    });

    expect(bodyRowCount()).toBe(1);
    expect(within(screen.getAllByRole("row")[1]).getAllByRole("cell")[0].textContent).toBe(
      "Chidi Nwosu",
    );
    expect(onFiltersChange).not.toHaveBeenCalled();
  });

  it("renders the search box even for a report with no date or staff filters", () => {
    renderDialog({ reportId: "customers" as ReportId });
    expect(screen.getByRole("textbox", { name: /search/i })).toBeTruthy();
  });
});

describe("ReportViewDialog in-modal re-fetch filters", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks the opener to re-fetch when the date range changes", () => {
    const { onFiltersChange } = renderDialog();
    fireEvent.click(screen.getByTestId("date-range"));
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ dateRange: { from: "2026-01-01", to: "2026-01-31" } }),
    );
  });

  it("asks the opener to re-fetch when the staff filter changes", () => {
    const { onFiltersChange } = renderDialog();
    fireEvent.click(screen.getByTestId("staff-select"));
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: "staff-9" }),
    );
  });

  it("asks the opener to re-fetch when the payment method changes", () => {
    const { onFiltersChange } = renderDialog();
    fireEvent.click(screen.getByTestId("payment-select"));
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: "card" }),
    );
  });

  it("keeps its own filter state: the opener's initialFilters stay the seed only", () => {
    const { onFiltersChange, rerender } = renderDialog();

    fireEvent.click(screen.getByTestId("staff-select"));
    expect(screen.getByTestId("staff-select").textContent).toBe("staff:staff-9");

    // The card behind the modal is unchanged, so it re-renders with the same
    // initialFilters it opened with: that must not reset what's in the modal.
    rerender(
      <ReportViewDialog
        open
        onOpenChange={() => {}}
        reportId={"sales" as ReportId}
        title="Detailed Sales Report"
        rows={rows}
        headers={["Cashier", "Total"]}
        initialFilters={baseFilters}
        onFiltersChange={onFiltersChange}
        isLoading={false}
        isExporting={false}
        onExport={() => {}}
      />,
    );

    expect(screen.getByTestId("staff-select").textContent).toBe("staff:staff-9");
  });

  it("keeps the filter controls on screen while a re-fetch is loading", () => {
    renderDialog({ isLoading: true });
    expect(screen.getByRole("textbox", { name: /search/i })).toBeTruthy();
    expect(screen.getByTestId("date-range")).toBeTruthy();
    expect(screen.getByTestId("staff-select")).toBeTruthy();
  });
});

describe("ReportViewDialog per-report filter rendering", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["sales", "profit-loss", "top_sellers"])(
    "renders date, staff and payment controls for %s",
    (reportId) => {
      renderDialog({ reportId: reportId as ReportId });
      expect(screen.getByTestId("date-range")).toBeTruthy();
      expect(screen.getByTestId("staff-select")).toBeTruthy();
      expect(screen.getByTestId("payment-select")).toBeTruthy();
    },
  );

  it("renders only the date range for expenses", () => {
    renderDialog({ reportId: "expenses" as ReportId });
    expect(screen.getByTestId("date-range")).toBeTruthy();
    expect(screen.queryByTestId("staff-select")).toBeNull();
    expect(screen.queryByTestId("payment-select")).toBeNull();
  });

  it.each(["stock_batches", "customers"])(
    "renders no re-fetch filters at all for %s",
    (reportId) => {
      renderDialog({ reportId: reportId as ReportId });
      expect(screen.queryByTestId("date-range")).toBeNull();
      expect(screen.queryByTestId("staff-select")).toBeNull();
      expect(screen.queryByTestId("payment-select")).toBeNull();
    },
  );
});
