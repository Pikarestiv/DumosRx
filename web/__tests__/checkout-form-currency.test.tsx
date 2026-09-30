import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CheckoutForm } from "@/components/storefront/checkout-form";
import { formatMoney } from "@/lib/utils/currency";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

const catalogCurrency = { value: "KES" as string | undefined };

vi.mock("@/lib/api/base-client", () => ({
  apiClient: {
    get: vi.fn(async () => ({
      data: {
        products: [{ id: "p1", name: "Panadol", selling_price: 500 }],
        online_payment_available: true,
        store: { currency: catalogCurrency.value },
      },
    })),
    post: vi.fn(async () => ({ data: { order: { id: "order-1" } } })),
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
      carts: { "store-1": [{ id: "p1", name: "Panadol", price: 500, quantity: 2 }] },
      reconcilePrices: vi.fn(),
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  catalogCurrency.value = "KES";
});

describe("formatMoney", () => {
  it("uses the naira sign for NGN", () => {
    expect(formatMoney(1000, "NGN")).toBe("₦1,000");
  });

  it("uses the store's own currency when it isn't NGN", () => {
    expect(formatMoney(1000, "GHS")).toBe("GH\u20b51,000");
    // No widely-recognised narrow symbol -> the ISO code, never a naira sign.
    expect(formatMoney(1000, "KES")).toBe("KES1,000");
  });

  it("falls back to NGN when no currency is known yet", () => {
    expect(formatMoney(1000, undefined)).toBe("₦1,000");
  });

  it("falls back to the raw code for an unrecognised currency", () => {
    expect(formatMoney(1000, "ZZZ")).toBe("ZZZ1,000");
  });
});

describe("CheckoutForm currency", () => {
  it("renders the store's own currency rather than a hardcoded naira sign", async () => {
    render(<CheckoutForm storeSlug="store-1" />);

    await waitFor(() => expect(screen.getByRole("button", { name: /place order/i }).textContent).toContain("KES1,000"));
    expect(screen.queryByText(/₦/)).not.toBeInTheDocument();
  });

  it("falls back to naira when the storefront reports no currency", async () => {
    catalogCurrency.value = undefined;

    render(<CheckoutForm storeSlug="store-1" />);

    await waitFor(() => expect(screen.getByRole("button", { name: /place order/i }).textContent).toContain("₦1,000"));
  });
});
