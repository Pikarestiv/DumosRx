import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckoutForm } from "@/components/storefront/checkout-form";
import { useCartRepricing } from "@/lib/store/use-cart-repricing";

const mockPush = vi.fn();
const { mockToastError, mockToastInfo, mockReconcilePrices, catalog } =
  vi.hoisted(() => ({
    mockToastError: vi.fn(),
    mockToastInfo: vi.fn(),
    mockReconcilePrices: vi.fn(),
    catalog: {
      products: [] as { id: string; selling_price: number }[],
      online_payment_available: true,
    },
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: mockToastError,
    info: mockToastInfo,
  },
}));

vi.mock("@/lib/api/base-client", () => ({
  apiClient: {
    get: vi.fn(async () => ({ data: catalog })),
    post: vi.fn(async (url: string) => {
      if (url.includes("/checkout/initialize")) {
        return { data: { payment_url: "https://paystack.com/pay/ref_1" } };
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
  useCartStore: {
    getState: () => ({
      carts: {
        "store-1": [
          { id: "p1", name: "Panadol", price: 500, quantity: 2 },
          { id: "p2", name: "Vitamin C", price: 300, quantity: 1 },
        ],
      },
      reconcilePrices: mockReconcilePrices,
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  catalog.products = [];
  catalog.online_payment_available = true;
  Object.defineProperty(window, "location", {
    value: { assign: vi.fn(), href: "" },
    writable: true,
  });
});

describe("Paystack redirect keeps the submit button locked (A-105)", () => {
  it("does not re-enable the button after the redirect starts", async () => {
    const user = userEvent.setup();
    render(<CheckoutForm storeSlug="store-1" />);

    await user.type(screen.getByLabelText(/full name/i), "Jane Doe");
    await user.type(screen.getByLabelText(/phone number/i), "08000000000");
    await user.click(await screen.findByLabelText(/pay online/i));
    await user.type(screen.getByLabelText(/email/i), "jane@example.com");

    const submit = screen.getByRole("button", { name: /place order/i });
    await user.click(submit);

    const { apiClient } = await import("@/lib/api/base-client");
    await waitFor(() =>
      expect(window.location.href).toBe("https://paystack.com/pay/ref_1"),
    );
    expect(submit).toBeDisabled();

    await user.click(submit);
    const initializeCalls = vi
      .mocked(apiClient.post)
      .mock.calls.filter(([url]) => String(url).includes("/checkout/initialize"));
    expect(initializeCalls).toHaveLength(1);
  });
});

describe("reprice names the items it removes (A-106)", () => {
  it("names each dropped item instead of saying 'some items'", async () => {
    catalog.products = [{ id: "p1", selling_price: 500 }];

    renderHook(() => useCartRepricing("store-1"));

    await waitFor(() => expect(mockReconcilePrices).toHaveBeenCalled());
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    const message = String(mockToastError.mock.calls.at(0)?.at(0));
    expect(message).toContain("Vitamin C");
    expect(message).not.toContain("Panadol");
  });

  it("still reports a plain price change without naming a removal", async () => {
    catalog.products = [
      { id: "p1", selling_price: 600 },
      { id: "p2", selling_price: 300 },
    ];

    renderHook(() => useCartRepricing("store-1"));

    await waitFor(() => expect(mockToastInfo).toHaveBeenCalled());
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
