import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import {
  DEFAULT_ENABLED_PAYMENT_METHODS,
  parseEnabledPaymentMethods,
} from "@/lib/payment-methods";
import { PaymentMethodSelector } from "@/components/pos/payment-method-selector";

/**
 * Regression coverage for FIXED_BUGS.md A-32: a store row whose
 * enabled_payment_methods column was never written must read back as NULL
 * after a sync pull, not as an empty list. NULL means "the store never chose",
 * and the POS shows every method; an empty list would render a payment step
 * with no payment buttons at all.
 */
function renderSelector(raw: string | null | undefined) {
  return render(
    <PaymentMethodSelector
      paymentMethod="cash"
      setPaymentMethod={vi.fn()}
      enabledPaymentMethods={parseEnabledPaymentMethods(raw)}
      selectedCustomer={null}
    />,
  );
}

describe("POS enabled payment methods fallback", () => {
  it("treats a NULL column as every method enabled", () => {
    expect(parseEnabledPaymentMethods(null)).toEqual(
      DEFAULT_ENABLED_PAYMENT_METHODS,
    );
  });

  it("treats an absent value as every method enabled", () => {
    expect(parseEnabledPaymentMethods(undefined)).toEqual(
      DEFAULT_ENABLED_PAYMENT_METHODS,
    );
  });

  it("renders every payment button when the synced value is NULL", () => {
    renderSelector(null);
    for (const label of ["Cash", "Card", "Transfer", "Credit", "Mixed"]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("still honours an explicit list the store chose", () => {
    renderSelector(JSON.stringify(["cash", "transfer"]));
    expect(screen.getByRole("button", { name: "Cash" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Transfer" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Card" })).toBeNull();
  });

  it("falls back rather than throwing on a double-encoded value", () => {
    expect(
      parseEnabledPaymentMethods(JSON.stringify(JSON.stringify(["cash"]))),
    ).toEqual(DEFAULT_ENABLED_PAYMENT_METHODS);
  });
});
