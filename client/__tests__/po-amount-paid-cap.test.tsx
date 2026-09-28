import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PODetailsFields } from "@/components/procurement/po-details-fields";

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/**
 * Amount Paid is a bare number field whose value getValidatedAmountPaid
 * silently caps at the order total on submit. Nothing said what that cap
 * was, or that anything had been changed by it.
 */
describe("Amount Paid cap messaging", () => {
  function renderFields(amountPaid: string, totalAmount: number) {
    render(
      <PODetailsFields
        poType="immediate"
        setPoType={vi.fn()}
        suppliers={[]}
        selectedSupplierId="__self__"
        setSelectedSupplierId={vi.fn()}
        notes=""
        setNotes={vi.fn()}
        paymentStatus="partial"
        setPaymentStatus={vi.fn()}
        dueDate=""
        setDueDate={vi.fn()}
        amountPaid={amountPaid}
        setAmountPaid={vi.fn()}
        totalAmount={totalAmount}
        onOpenAddSupplier={vi.fn()}
      />,
    );
  }

  it("gives the Amount Paid field a decimal keypad and an accessible name", () => {
    renderFields("", 5000);
    const input = screen.getByLabelText(
      /Amount Paid/i,
    ) as HTMLInputElement;
    expect(input.getAttribute("inputMode")).toBe("decimal");
  });

  it("states the cap once the order has a total", () => {
    renderFields("", 5000);
    expect(screen.getByText(/Max ₦5,000/)).toBeTruthy();
  });

  it("explains instead of showing a meaningless max of zero before any item is added", () => {
    renderFields("", 0);
    expect(screen.queryByText(/Max ₦0/)).toBeNull();
    expect(screen.getByText(/items you add/i)).toBeTruthy();
  });

  it("warns when the typed amount is above the total and will be capped", () => {
    renderFields("9000", 5000);
    expect(screen.getByText(/capped/i)).toBeTruthy();
  });

  it("stays quiet when the typed amount is within the total", () => {
    renderFields("2000", 5000);
    expect(screen.queryByText(/capped/i)).toBeNull();
  });
});
