import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckoutForm } from "@/components/storefront/checkout-form";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api/base-client", () => ({
  apiClient: {
    get: vi.fn(async () => ({ data: { products: [], online_payment_available: true } })),
    post: vi.fn(async (url: string) => {
      if (url.includes("/checkout/initialize")) {
        return { data: { payment_url: "https://paystack.com/pay/ref_1", transaction_reference: "ref_1" } };
      }
      return { data: { order: { id: "order-1" } } };
    }),
  },
}));

vi.mock("@/lib/store/use-cart-store", () => ({
  useCart: () => ({
    items: [{ id: "p1", name: "Panadol", price: 500, quantity: 2 }],
    getTotal: () => 1000,
    clearCart: vi.fn(),
  }),
  useCartStore: { getState: () => ({ carts: { "store-1": [{ id: "p1", price: 500, quantity: 2 }] }, reconcilePrices: vi.fn() }) },
}));

// jsdom has no real navigation - assert on window.location.href being set
// instead of actually following it.
const locationAssign = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "location", {
    value: { assign: locationAssign, href: "" },
    writable: true,
  });
});

describe("CheckoutForm - Paystack", () => {
  it("offers a Paystack option when the store has online payment available", async () => {
    render(<CheckoutForm storeSlug="store-1" />);

    expect(await screen.findByLabelText(/pay online/i)).toBeInTheDocument();
  });

  it("initializes a Paystack session and redirects to the payment URL on submit", async () => {
    const user = userEvent.setup();
    render(<CheckoutForm storeSlug="store-1" />);

    await user.type(screen.getByLabelText(/full name/i), "Jane Doe");
    await user.type(screen.getByLabelText(/phone number/i), "08000000000");
    await user.click(await screen.findByLabelText(/pay online/i));
    await user.type(screen.getByLabelText(/email/i), "jane@example.com");
    await user.click(screen.getByRole("button", { name: /place order/i }));

    const { apiClient } = await import("@/lib/api/base-client");
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        "/storefront/store-1/checkout/initialize",
        expect.objectContaining({ customer_email: "jane@example.com" }),
      ),
    );
    await waitFor(() => expect(window.location.href).toBe("https://paystack.com/pay/ref_1"));
  });
});
