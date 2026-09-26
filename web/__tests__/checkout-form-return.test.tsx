import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CheckoutForm } from "@/components/storefront/checkout-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("reference=ref_1&trxref=ref_1"),
}));

vi.mock("@/lib/api/base-client", () => ({
  apiClient: {
    get: vi.fn(async () => ({ data: { products: [], online_payment_available: true } })),
    post: vi.fn(async () => ({ data: { order: { id: "order-confirmed-1" } } })),
  },
}));

describe("CheckoutForm - Paystack return", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.setItem(
      "dumos_pending_checkout_store-1",
      JSON.stringify({
        formData: { customer_name: "Jane Doe", customer_phone: "08000000000", customer_address: "", customer_email: "jane@example.com", payment_method: "paystack" },
        items: [{ product_id: "p1", quantity: 2 }],
      }),
    );
  });

  it("confirms the order automatically when returning from Paystack with a reference", async () => {
    render(<CheckoutForm storeSlug="store-1" />);

    const { apiClient } = await import("@/lib/api/base-client");
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/storefront/store-1/checkout",
        expect.objectContaining({ payment_method: "paystack", paystack_reference: "ref_1" }),
      ),
    );
    expect(sessionStorage.getItem("dumos_pending_checkout_store-1")).toBeNull();
  });
});
