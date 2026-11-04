import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StorefrontCatalogView } from "@/components/storefront/storefront-catalog-view";

vi.mock("@/lib/store/use-cart-store", () => ({
  useCart: () => ({
    items: [],
    addItem: vi.fn(),
    removeItem: vi.fn(),
    updateQuantity: vi.fn(),
    clearCart: vi.fn(),
    getTotal: () => 0,
  }),
}));

const sampleCatalog = {
  data: [
    {
      id: "p1",
      name: "PARACETAMOL 500MG",
      selling_price: 250,
      requires_prescription: false,
      category: { name: "Pain Relief" },
    },
    {
      id: "p2",
      name: "AMOXIL CAP",
      selling_price: 1200,
      requires_prescription: true,
      category: { name: "Antibiotics" },
    },
  ],
  links: {
    first: "/products?page=1",
    last: "/products?page=2",
    prev: null,
    next: "/products?page=2",
  },
  meta: {
    current_page: 1,
    from: 1,
    last_page: 2,
    path: "/products",
    per_page: 50,
    to: 2,
    total: 52,
  },
  categories: [
    { id: "c1", name: "Pain Relief", count: 1 },
    { id: "c2", name: "Antibiotics", count: 1 },
  ],
};

describe("StorefrontCatalogView", () => {
  it("renders the initial products with title-casing and prices", () => {
    render(
      <StorefrontCatalogView
        storeSlug="grace"
        currency="NGN"
        initialData={sampleCatalog}
      />,
    );

    expect(screen.getByText("Paracetamol 500MG")).toBeTruthy();
    expect(screen.getByText("Amoxil Cap")).toBeTruthy();
    expect(screen.getByText("Showing 1–2 of 52 products")).toBeTruthy();
  });

  it("renders category badges with product counts", () => {
    render(
      <StorefrontCatalogView
        storeSlug="grace"
        currency="NGN"
        initialData={sampleCatalog}
      />,
    );

    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.getByText("Pain Relief (1)")).toBeTruthy();
    expect(screen.getByText("Antibiotics (1)")).toBeTruthy();
  });

  it("shows an empty state when catalog has no products", () => {
    render(
      <StorefrontCatalogView
        storeSlug="grace"
        currency="NGN"
        initialData={{
          ...sampleCatalog,
          data: [],
          meta: { ...sampleCatalog.meta, total: 0, from: null, to: null, last_page: 1 },
        }}
      />,
    );

    expect(screen.getByText("No products found")).toBeTruthy();
  });
});

