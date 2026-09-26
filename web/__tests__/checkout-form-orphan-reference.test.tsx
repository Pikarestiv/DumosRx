import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CheckoutForm } from "@/components/storefront/checkout-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("reference=ref_orphan&trxref=ref_orphan"),
}));

const { postMock } = vi.hoisted(() => ({
  postMock: vi.fn(async () => ({ data: {} })),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/api/base-client", () => ({
  apiClient: {
    get: vi.fn(async () => ({ data: { products: [], online_payment_available: true } })),
    post: postMock,
  },
}));

/**
 * A customer who returns from Paystack in a new tab, a different session, or
 * with storage cleared has no pending entry to confirm against - the old
 * behaviour silently rendered an ordinary empty cart, hiding the fact that
 * they had just paid.
 */
describe("CheckoutForm - returning with a reference but no pending checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("shows the reference and tells the customer to contact the store", async () => {
    render(<CheckoutForm storeSlug="store-1" />);

    expect(await screen.findByText(/ref_orphan/)).toBeTruthy();
    expect(screen.getByText(/contact the store/i)).toBeTruthy();
    expect(screen.queryByText(/your cart is empty/i)).toBeNull();
    expect(postMock).not.toHaveBeenCalled();
  });
});
