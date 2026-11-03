import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductCard } from "@/components/storefront/product-card";
import type { StorefrontProduct } from "@/lib/types/storefront";

vi.mock("@/lib/store/use-cart-store", () => ({ useCart: () => ({ addItem: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const product = { id: "p1", name: "Panadol", selling_price: 1500, requires_prescription: false } as unknown as StorefrontProduct;

describe("storefront ProductCard currency", () => {
  it("prices a product in the store's own currency instead of assuming naira", () => {
    render(<ProductCard product={product} storeSlug="s" currency="KES" />);
    const price = screen.getByText(/1,500/);
    expect(price.textContent).not.toContain("₦");
    expect(price.textContent).toMatch(/K/);
  });

  it("falls back to the platform currency when the store has none", () => {
    render(<ProductCard product={product} storeSlug="s" />);
    expect(screen.getByText(/1,500/).textContent).toContain("₦");
  });
});

describe("storefront ProductCard name", () => {
  it("title-cases an all-caps catalogue name for display", () => {
    render(<ProductCard product={{ ...product, name: "PARACETAMOL 500MG" }} storeSlug="s" />);
    expect(screen.getByText("Paracetamol 500MG")).toBeTruthy();
  });
});
