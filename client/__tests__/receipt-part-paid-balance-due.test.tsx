import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReceiptView, type ReceiptTransaction } from "@/components/pos/receipt-view";

const storeProfile: Record<string, unknown> = {
  name: "Divamax Pharmacy",
  currency: "NGN",
  show_barcode_on_receipt: 1,
};

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile, vatPercentage: 0 }),
}));

vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({ canCustomizeTheme: false, canRemoveBranding: false }),
}));

vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "",
}));

vi.mock("react-barcode", () => ({
  default: () => <div data-testid="receipt-barcode" />,
}));

const baseTransaction: ReceiptTransaction = {
  id: "38a8bab2-1234-5678-abcd-ef0123456789",
  date: "2026-11-17T10:00:00.000Z",
  cashier: "Cashier Alice",
  items: [
    {
      id: "item-1",
      name: "Paracetamol 500mg",
      quantity: 2,
      unit_price: 5000,
      subtotal: 10000,
    },
  ],
  customer: {
    name: "John Doe",
  },
  subtotal: 10000,
  tax: 0,
  discount: 0,
  total: 10000,
  paymentMethod: "cash",
  amountPaid: 10000,
  change: 0,
};

describe("A-269: ReceiptView prints Balance due on part-paid and credit sales", () => {
  it("prints Total paid and Balance due when a sale is part-paid", () => {
    const partPaid: ReceiptTransaction = {
      ...baseTransaction,
      amountPaid: 4000,
      change: 0,
    };

    render(<ReceiptView transaction={partPaid} paperSize="thermal" />);

    expect(screen.getByText("Total paid:")).toBeTruthy();
    expect(screen.getByText("Balance due:")).toBeTruthy();
    expect(screen.queryByText("Change:")).toBeNull();

    // Check amounts rendered
    expect(screen.getByText(/4,000/)).toBeTruthy();
    expect(screen.getByText(/6,000/)).toBeTruthy();
  });

  it("prints Balance due for 100% credit sales where amountPaid is zero", () => {
    const creditSale: ReceiptTransaction = {
      ...baseTransaction,
      paymentMethod: "credit",
      amountPaid: 0,
      change: 0,
    };

    render(<ReceiptView transaction={creditSale} paperSize="a4" />);

    expect(screen.getByText("Total paid:")).toBeTruthy();
    const balanceDueLabel = screen.getByText("Balance due:");
    expect(balanceDueLabel).toBeTruthy();
    expect(screen.queryByText("Change:")).toBeNull();

    // The Balance due container contains ₦10,000
    const balanceContainer = balanceDueLabel.closest("div");
    expect(balanceContainer?.textContent).toContain("10,000");
  });

  it("does not print Balance due when the sale is fully paid", () => {
    const fullyPaid: ReceiptTransaction = {
      ...baseTransaction,
      amountPaid: 10000,
      change: 0,
    };

    render(<ReceiptView transaction={fullyPaid} paperSize="thermal" />);

    expect(screen.queryByText("Balance due:")).toBeNull();
    expect(screen.queryByText("Change:")).toBeNull();
  });

  it("prints Change and does not print Balance due when customer overpaid", () => {
    const overpaid: ReceiptTransaction = {
      ...baseTransaction,
      amountPaid: 12000,
      change: 2000,
    };

    render(<ReceiptView transaction={overpaid} paperSize="thermal" />);

    expect(screen.getByText("Total paid:")).toBeTruthy();
    const changeLabel = screen.getByText("Change:");
    expect(changeLabel).toBeTruthy();
    expect(screen.queryByText("Balance due:")).toBeNull();
    const changeContainer = changeLabel.closest("div");
    expect(changeContainer?.textContent).toContain("2,000");
  });

  it("renders Balance due in both thermal and A4 layouts", () => {
    const partPaid: ReceiptTransaction = {
      ...baseTransaction,
      amountPaid: 7500,
      change: 0,
    };

    const thermal = render(<ReceiptView transaction={partPaid} paperSize="thermal" />);
    expect(thermal.getByText("Balance due:")).toBeTruthy();
    expect(thermal.getByText(/2,500/)).toBeTruthy();

    const a4 = render(<ReceiptView transaction={partPaid} paperSize="a4" />);
    expect(a4.getAllByText("Balance due:").length).toBeGreaterThanOrEqual(1);
  });

  it("does not render payment details or Balance due on quotes", () => {
    const quoteTransaction: ReceiptTransaction = {
      ...baseTransaction,
      amountPaid: 0,
      change: 0,
    };

    render(<ReceiptView transaction={quoteTransaction} documentType="quote" />);

    expect(screen.queryByText("Total paid:")).toBeNull();
    expect(screen.queryByText("Balance due:")).toBeNull();
    expect(screen.queryByText("Payment type:")).toBeNull();
  });
});
