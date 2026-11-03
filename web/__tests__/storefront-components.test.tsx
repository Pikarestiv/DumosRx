import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StoreBranchSelector } from "@/components/storefront/store-branch-selector";
import { StoreOrderTracker } from "@/components/storefront/store-order-tracker";
import { StorePrescriptionForm } from "@/components/storefront/store-prescription-form";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/store/demo",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/store/use-cart-store", () => ({
  useCart: () => ({
    items: [],
    clearCart: vi.fn(),
  }),
}));

describe("StoreBranchSelector", () => {
  it("renders nothing when only 1 branch exists", () => {
    const { container } = render(
      <StoreBranchSelector
        branches={[{ id: "b1", name: "Main Branch", is_primary: true }]}
        selectedBranchId="b1"
        storeSlug="demo"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders branch selector button when multiple branches exist", () => {
    render(
      <StoreBranchSelector
        branches={[
          { id: "b1", name: "Main Branch", is_primary: true },
          { id: "b2", name: "Victoria Island", is_primary: false },
        ]}
        selectedBranchId="b1"
        storeSlug="demo"
      />
    );
    expect(screen.getByRole("button", { name: /main branch/i })).toBeDefined();
  });
});

describe("StoreOrderTracker", () => {
  it("renders tracker search form with input", () => {
    render(<StoreOrderTracker storeSlug="demo" />);
    expect(screen.getByPlaceholderText(/DRX-SF-/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /track/i })).toBeDefined();
  });

  it("handles empty submission gracefully", async () => {
    render(<StoreOrderTracker storeSlug="demo" />);
    const submitBtn = screen.getByRole("button", { name: /track/i });
    fireEvent.click(submitBtn);
    expect(screen.getByPlaceholderText(/DRX-SF-/i)).toBeDefined();
  });
});

describe("StorePrescriptionForm", () => {
  it("renders patient information inputs and upload button", () => {
    render(
      <StorePrescriptionForm
        storeSlug="demo"
        branches={[{ id: "b1", name: "Main Branch" }]}
      />
    );
    expect(screen.getByPlaceholderText(/Mary Okonkwo/i)).toBeDefined();
    expect(screen.getByPlaceholderText(/08012345678/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /submit prescription/i })).toBeDefined();
  });
});
