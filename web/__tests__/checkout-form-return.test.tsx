import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { CheckoutForm } from "@/components/storefront/checkout-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("reference=ref_1&trxref=ref_1"),
}));

const { toastError, postMock } = vi.hoisted(() => ({
  toastError: vi.fn(),
  postMock: vi.fn(async () => ({ data: { order: { id: "order-confirmed-1" } } })),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    success: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/api/base-client", () => ({
  apiClient: {
    get: vi.fn(async () => ({ data: { products: [], online_payment_available: true } })),
    post: postMock,
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

  it("keeps the pending checkout and shows the reference when confirmation fails with an axios-style error", async () => {
    // An axios error is `instanceof Error` but its message is a generic
    // HTTP status string - the customer still needs the reference to quote.
    const axiosError = Object.assign(new Error("Request failed with status code 400"), {
      isAxiosError: true,
      response: { status: 400, data: { message: "Order already confirmed" } },
    });
    postMock.mockRejectedValue(axiosError);

    render(<CheckoutForm storeSlug="store-1" />);

    await waitFor(() => expect(toastError).toHaveBeenCalled());

    const [message] = toastError.mock.calls[0];
    expect(message).toContain("ref_1");
    expect(sessionStorage.getItem("dumos_pending_checkout_store-1")).not.toBeNull();
  });
});
