import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StorePaymentsCard } from "@/components/admin/stores/details/store-detail-sections";
import type { AdminStoreDetail } from "@/lib/types/admin";

const storeWithPaymentMethods = (methods: unknown): AdminStoreDetail =>
  ({
    id: "edc5b0f0-6f59-4ce7-8015-5f96fa311895",
    payments: {
      paystack_connected: false,
      subaccount_code: null,
      bank_code: null,
      account_number_last4: null,
      require_payment_account: false,
      enabled_payment_methods: methods,
    },
  }) as unknown as AdminStoreDetail;

describe("StorePaymentsCard enabled_payment_methods", () => {
  it("renders the methods when the server sends a real array", () => {
    render(<StorePaymentsCard store={storeWithPaymentMethods(["cash", "card"])} />);

    expect(screen.getByText("cash, card")).toBeInTheDocument();
  });

  it("does not crash when a double-encoded column makes the server send a JSON string", () => {
    expect(() =>
      render(<StorePaymentsCard store={storeWithPaymentMethods('["cash","card"]')} />),
    ).not.toThrow();

    expect(screen.getByText("Enabled Methods")).toBeInTheDocument();
  });

  it("does not crash when the value is neither an array nor a string", () => {
    expect(() =>
      render(<StorePaymentsCard store={storeWithPaymentMethods({ cash: true })} />),
    ).not.toThrow();

    expect(() => render(<StorePaymentsCard store={storeWithPaymentMethods(null)} />)).not.toThrow();
  });
});
