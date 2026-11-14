import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductCard } from "@/components/storefront/product-card";
import type { StorefrontProduct } from "@/lib/types/storefront";

vi.mock("@/lib/store/use-cart-store", () => ({ useCart: () => ({ addItem: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const base = { id: "p1", name: "PARACETAMOL 500MG", selling_price: 1500 } as StorefrontProduct;
const IMAGE = "https://img.example.test/stores/s1/products/p1/a.webp";

describe("storefront ProductCard image", () => {
  it("shows the product image lazily, sized, with the display name as alt text", () => {
    render(<ProductCard product={{ ...base, image_url: IMAGE }} storeSlug="s" />);

    const img = screen.getByRole("img", { name: "Paracetamol 500MG" });
    expect(img.getAttribute("src")).toBe(IMAGE);
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("width")).toBe("512");
    expect(img.getAttribute("height")).toBe("512");
  });

  it("renders no image for a product without one, including older API responses that omit the field", () => {
    render(<ProductCard product={{ ...base, image_url: null }} storeSlug="s" />);
    render(<ProductCard product={base} storeSlug="s" />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getAllByText("Paracetamol 500MG")).toHaveLength(2);
  });

  it("drops the image when it fails to load", () => {
    render(<ProductCard product={{ ...base, image_url: IMAGE }} storeSlug="s" />);

    fireEvent.error(screen.getByRole("img", { name: "Paracetamol 500MG" }));

    expect(screen.queryByRole("img")).toBeNull();
  });
});
