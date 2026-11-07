import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { POSPaymentDialog } from "@/components/pos/pos-payment-dialog";
import { PaymentSplits } from "@/components/pos/payment-splits";

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { id: "store1", currency: "NGN" } }),
}));

vi.mock("@/lib/hooks/use-default-payment-accounts", () => ({
  useDefaultPaymentAccounts: () => ({
    defaults: {},
    setDefaultAccount: vi.fn(),
    clearDefaultAccount: vi.fn(),
  }),
}));

describe("POSPaymentDialog shortfall UX", () => {
  it("renders 'Pay Exact' button when cash payment is short of total and clicking it sets amountPaid to total", () => {
    const setAmountPaid = vi.fn();
    render(
      <POSPaymentDialog
        showPaymentDialog={true}
        setShowPaymentDialog={vi.fn()}
        total={850}
        paymentMethod="cash"
        setPaymentMethod={vi.fn()}
        amountPaid="700"
        setAmountPaid={setAmountPaid}
        processingPayment={false}
        handlePayment={vi.fn()}
        selectedCustomer={null}
        currencyCode="NGN"
      />,
    );

    expect(screen.getByText(/150.*short/i)).toBeTruthy();
    const payExactBtn = screen.getByRole("button", { name: /Pay Exact/i });
    expect(payExactBtn).toBeTruthy();

    fireEvent.click(payExactBtn);
    expect(setAmountPaid).toHaveBeenCalledWith("850");
  });
});

describe("PaymentSplits shortage UX", () => {
  it("renders 'Cover Remaining' button when splits are short and clicking it fills the shortage into the split", () => {
    const setPaymentSplits = vi.fn();
    render(
      <PaymentSplits
        total={850}
        currencyCode="NGN"
        paymentSplits={[{ method: "transfer", amount: 700 }]}
        setPaymentSplits={setPaymentSplits}
        selectedCustomer={null}
        defaults={{}}
        isValidAccount={() => true}
      />,
    );

    expect(screen.getByText(/150.*Short/i)).toBeTruthy();
    const coverBtn = screen.getByRole("button", { name: /Cover Remaining/i });
    expect(coverBtn).toBeTruthy();

    fireEvent.click(coverBtn);
    expect(setPaymentSplits).toHaveBeenCalledWith([
      { method: "transfer", amount: 850 },
    ]);
  });
});
