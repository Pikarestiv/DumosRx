import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckoutForm } from "@/components/storefront/checkout-form";
import { useCartStore } from "@/lib/store/use-cart-store";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("reference=ref_1&trxref=ref_1"),
}));

const { toastError, postMock, getMock } = vi.hoisted(() => ({
  toastError: vi.fn(),
  postMock: vi.fn(async () => ({ data: { order: { id: "order-confirmed-1" } } })),
  getMock: vi.fn(async () => ({
    data: {
      products: [{ id: "p1", selling_price: 2500 }],
      online_payment_available: true,
    },
  })),
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
    get: getMock,
    post: postMock,
  },
}));

const axiosStyleError = (status: number, data: Record<string, unknown>) =>
  Object.assign(new Error(String(data.message ?? `Request failed with status code ${status}`)), {
    isAxiosError: true,
    response: { status, data },
  });

describe("CheckoutForm - Paystack return", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    postMock.mockResolvedValue({ data: { order: { id: "order-confirmed-1" } } });
    useCartStore.setState({
      carts: { "store-1": [{ id: "p1", name: "Paracetamol", price: 2500, quantity: 2 }] },
    });
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
    postMock.mockRejectedValue(
      axiosStyleError(400, { message: "Order already confirmed" }),
    );

    render(<CheckoutForm storeSlug="store-1" />);

    await waitFor(() => expect(toastError).toHaveBeenCalled());

    const [message] = toastError.mock.calls[0];
    expect(message).toContain("ref_1");
    expect(sessionStorage.getItem("dumos_pending_checkout_store-1")).not.toBeNull();
  });

  it("renders a dedicated panel instead of the live order form when confirmation fails", async () => {
    postMock.mockRejectedValue(axiosStyleError(500, { message: "Server error" }));

    render(<CheckoutForm storeSlug="store-1" />);

    expect(await screen.findByText(/ref_1/)).toBeTruthy();
    expect(screen.getByText(/payment may have gone through/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /place order/i })).toBeNull();
    expect(screen.queryByText(/delivery & payment/i)).toBeNull();
    expect(useCartStore.getState().carts["store-1"]?.length).toBe(1);
  });

  it("offers a retry that re-posts the retained pending checkout", async () => {
    postMock.mockRejectedValue(axiosStyleError(500, { message: "Server error" }));

    render(<CheckoutForm storeSlug="store-1" />);

    const retry = await screen.findByRole("button", { name: /retry confirmation/i });
    expect(postMock).toHaveBeenCalledTimes(1);

    postMock.mockResolvedValue({ data: { order: { id: "order-confirmed-1" } } });
    await userEvent.click(retry);

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(2));
    expect(postMock).toHaveBeenLastCalledWith(
      "/storefront/store-1/checkout",
      expect.objectContaining({ payment_method: "paystack", paystack_reference: "ref_1" }),
    );
    await waitFor(() =>
      expect(sessionStorage.getItem("dumos_pending_checkout_store-1")).toBeNull(),
    );
  });

  it("tells the customer the payment was refunded and offers no retry on a 422 refunded body", async () => {
    postMock.mockRejectedValue(
      axiosStyleError(422, {
        message: "Your payment went through but this order can no longer be fulfilled - it is being refunded.",
        refunded: true,
      }),
    );

    render(<CheckoutForm storeSlug="store-1" />);

    expect(await screen.findByText(/your payment is being refunded/i)).toBeTruthy();
    expect(screen.getByText(/it has been refunded/i)).toBeTruthy();
    expect(screen.getByText(/ref_1/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /retry confirmation/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /place order/i })).toBeNull();
  });
});
