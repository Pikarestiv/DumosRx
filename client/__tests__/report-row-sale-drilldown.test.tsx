import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const getSaleByTransactionNumber = vi.fn();
const toastError = vi.fn();

vi.mock("@/lib/db/queries/sales", () => ({
  getSaleByTransactionNumber: (reference: string) =>
    getSaleByTransactionNumber(reference),
}));
vi.mock("sonner", () => ({ toast: { error: toastError } }));
vi.mock("@/lib/db/queries/reports", () => ({
  fetchSalesReportData: vi.fn(),
  fetchStockBatchReportData: vi.fn(),
  fetchProfitLossReportData: vi.fn(),
  fetchCustomerReportData: vi.fn(),
  fetchExpensesReportData: vi.fn(),
  fetchTopSellersReportData: vi.fn(),
}));
vi.mock("@/lib/context/store-context", () => ({ useStore: () => ({}) }));

// The Detailed Sales Report drills a row down to its line items the way Daily Close does:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-report-row-sale-drilldown-test-tsx-L22
describe("report row sale drill-down", () => {
  beforeEach(() => {
    getSaleByTransactionNumber.mockReset();
    toastError.mockReset();
  });

  it("marks only the sales report's rows as drillable", async () => {
    const { getReportDrilldownColumn } = await import(
      "@/lib/hooks/use-report-export"
    );
    expect(getReportDrilldownColumn("sales")).toBe("Transaction #");
    for (const id of [
      "stock_batches",
      "profit-loss",
      "customers",
      "expenses",
      "top_sellers",
    ] as const) {
      expect(getReportDrilldownColumn(id)).toBeUndefined();
    }
  });

  it("names a column the sales report actually returns", async () => {
    const { getReportDrilldownColumn, getReportHeaders } = await import(
      "@/lib/hooks/use-report-export"
    );
    expect(getReportHeaders("sales")).toContain(
      getReportDrilldownColumn("sales"),
    );
  });

  it("resolves a clicked transaction number to its sale", async () => {
    const sale = { id: "sale-1", transaction_number: "TXN-9" };
    getSaleByTransactionNumber.mockResolvedValue(sale);
    const { useSaleDrilldown } = await import("@/lib/hooks/use-sale-drilldown");

    function Harness() {
      const { sale: opened, openByReference, close } = useSaleDrilldown();
      return (
        <div>
          <button onClick={() => void openByReference(" TXN-9 ")}>open</button>
          <button onClick={close}>close</button>
          <span data-testid="opened">{opened?.id ?? "none"}</span>
        </div>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByText("open"));
    await waitFor(() =>
      expect(screen.getByTestId("opened").textContent).toBe("sale-1"),
    );
    expect(getSaleByTransactionNumber).toHaveBeenCalledWith("TXN-9");

    fireEvent.click(screen.getByText("close"));
    expect(screen.getByTestId("opened").textContent).toBe("none");
  });

  it("tells the user when no sale matches instead of opening an empty dialog", async () => {
    getSaleByTransactionNumber.mockResolvedValue(null);
    const { useSaleDrilldown } = await import("@/lib/hooks/use-sale-drilldown");

    function Harness() {
      const { sale, openByReference } = useSaleDrilldown();
      return (
        <div>
          <button onClick={() => void openByReference("TXN-GONE")}>open</button>
          <span data-testid="opened">{sale?.id ?? "none"}</span>
        </div>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByText("open"));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.getByTestId("opened").textContent).toBe("none");
  });

  it("does nothing for a row with no usable reference", async () => {
    const { useSaleDrilldown } = await import("@/lib/hooks/use-sale-drilldown");

    function Harness() {
      const { openByReference } = useSaleDrilldown();
      return <button onClick={() => void openByReference(null)}>open</button>;
    }

    render(<Harness />);
    fireEvent.click(screen.getByText("open"));
    expect(getSaleByTransactionNumber).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });
});
