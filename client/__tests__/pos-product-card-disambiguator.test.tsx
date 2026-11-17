import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { POSProduct } from "@/lib/types/product";

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { allow_sale_without_stock: 1, pos_show_product_images: 0 } }),
}));

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));

vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({ canUseResellerCommission: true }),
  isSaleWithoutStockEnabled: () => true,
}));

import { POSProductCard, type GroupedProduct } from "@/components/pos/pos-product-card";

function renderCardWithProps(overrides: Partial<POSProduct>) {
  const product = {
    id: "38a8bab2-1234-5678-abcd-ef0123456789",
    name: "CARO WHITE CUP CREAM",
    generic_name: "",
    strength: "",
    unit_price: 1500,
    stock: 10,
    reorder_level: 2,
    posGroup: "standard",
    ...overrides,
  } as GroupedProduct & POSProduct;

  return render(
    <POSProductCard
      product={product}
      addToCart={() => {}}
      displayStockLevels={true}
    />,
  );
}

describe("A-186: POSProductCard disambiguator subtitle", () => {
  it("renders generic_name and strength when both are present", () => {
    renderCardWithProps({
      name: "Amoxil",
      generic_name: "Amoxicillin",
      strength: "500mg",
      barcode: "SKU-9999",
      category_name: "Antibiotics",
    });

    expect(screen.getByText("Amoxicillin • 500mg")).toBeTruthy();
    expect(screen.queryByText("SKU-9999 · Antibiotics")).toBeNull();
  });

  it("renders generic_name when strength is absent", () => {
    renderCardWithProps({
      name: "Panadol Extra",
      generic_name: "Paracetamol",
      strength: "",
      barcode: "SKU-1001",
    });

    expect(screen.getByText("Paracetamol")).toBeTruthy();
  });

  it("renders strength when generic_name is absent", () => {
    renderCardWithProps({
      name: "Ibuprofen Capsules",
      generic_name: "",
      strength: "400mg",
      barcode: "SKU-1002",
    });

    expect(screen.getByText("400mg")).toBeTruthy();
  });

  it("falls back to barcode · category when generic and strength are absent (imported goods)", () => {
    renderCardWithProps({
      name: "CARO WHITE CUP B/S CREAM",
      generic_name: "",
      strength: "",
      barcode: "2189",
      category_name: "Cosmetics",
    });

    expect(screen.getByText("2189 · Cosmetics")).toBeTruthy();
  });

  it("falls back to barcode when category, generic, and strength are absent", () => {
    renderCardWithProps({
      name: "CARO WHITE CUP S/S CREAM",
      generic_name: "",
      strength: "",
      barcode: "2190",
      category_name: "",
    });

    expect(screen.getByText("2190")).toBeTruthy();
  });

  it("falls back to category when barcode, generic, and strength are absent", () => {
    renderCardWithProps({
      name: "CARO WHITE LOTION 500ML",
      generic_name: "",
      strength: "",
      barcode: "",
      category_name: "Lotions",
    });

    expect(screen.getByText("Lotions")).toBeTruthy();
  });

  it("treats placeholder 'Generic' and '-' as absent and falls back to barcode", () => {
    renderCardWithProps({
      name: "CARO WHITE LOTION 200ML",
      generic_name: "Generic",
      strength: "-",
      barcode: "2185",
      category_name: "Cosmetics",
    });

    // Does NOT render "Generic • -"
    expect(screen.queryByText(/Generic • -/)).toBeNull();
    expect(screen.getByText("2185 · Cosmetics")).toBeTruthy();
  });

  it("falls back to short id (8 chars) when no generic, strength, barcode, or category exists", () => {
    renderCardWithProps({
      id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      name: "Uncategorized Item",
      generic_name: "",
      strength: "",
      barcode: "",
      category_name: "",
    });

    expect(screen.getByText("a1b2c3d4")).toBeTruthy();
  });
});
