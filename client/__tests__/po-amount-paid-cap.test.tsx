import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PODetailsFields } from "@/components/procurement/po-details-fields";

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { currency: undefined } }),
}));

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

// Amount Paid is a bare number field whose value getValidatedAmountPaid silently caps at the order total on submit.
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-po-amount-paid-cap-test-tsx-L18
describe("Amount Paid cap messaging", () => {
  const setPaidInFull = vi.fn();
  function renderFields(amountPaid: string, totalAmount: number, paidInFull = false) {
    render(
      <PODetailsFields
        suppliers={[]}
        selectedSupplierId="__self__"
        setSelectedSupplierId={vi.fn()}
        notes=""
        setNotes={vi.fn()}
        paidInFull={paidInFull}
        setPaidInFull={setPaidInFull}
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

  it("offers a due date while money is still owed", () => {
    renderFields("", 1000);
    expect(screen.getByText(/Due Date/)).toBeTruthy();
    expect(screen.queryByText(/Order Type/)).toBeNull();
  });

  it("hides the due date once the order is paid in full or the amount paid covers the total", () => {
    renderFields("", 1000, true);
    expect(screen.queryByText(/Due Date/)).toBeNull();
    document.body.innerHTML = "";
    renderFields("1000", 1000);
    expect(screen.queryByText(/Due Date/)).toBeNull();
  });

  it("derives unpaid, part paid or fully paid from the amount instead of asking for a status", () => {
    renderFields("", 5000);
    expect(screen.getByText(/^Unpaid/)).toBeTruthy();
    document.body.innerHTML = "";
    renderFields("2000", 5000);
    expect(screen.getByText(/Part paid, a balance remains/)).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: /payment status/i })).toBeNull();
  });

  it("marks the order paid in full with one tap and shows the total as paid", () => {
    renderFields("", 5000);
    fireEvent.click(screen.getByRole("button", { name: "Paid in full" }));
    expect(setPaidInFull).toHaveBeenCalledWith(true);
    document.body.innerHTML = "";
    renderFields("", 5000, true);
    expect((screen.getByLabelText("Amount Paid") as HTMLInputElement).value).toBe("5000");
    expect(screen.getByText(/^Fully paid/)).toBeTruthy();
  });
});
