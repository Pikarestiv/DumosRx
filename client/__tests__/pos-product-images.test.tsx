import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { POSProduct } from "@/lib/types/product";
import {
  PRODUCT_IMAGES_DISABLED,
  useProductImageConfigStore,
} from "@/lib/product-images/config-store";

const store = vi.hoisted(() => ({
  profile: {} as Record<string, unknown>,
  updateStoreProfile: vi.fn(async (_data: Record<string, unknown>) => {}),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: store.profile, updateStoreProfile: store.updateStoreProfile }),
}));

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));

vi.mock("@/lib/hooks/use-feature-gate", () => ({
  useFeatureGate: () => ({ canUseResellerCommission: true }),
  isSaleWithoutStockEnabled: () => false,
}));

import { POSProductCard, type GroupedProduct } from "@/components/pos/pos-product-list";
import { RegisterConfigCard } from "@/components/settings/store/register-config-card";

const KEY = "stores/s1/products/p1/abc.webp";
const ENABLED = { ...PRODUCT_IMAGES_DISABLED, enabled: true, public_base_url: "https://img.example.test" };

function renderTile(imageKey: string | null = KEY) {
  const product = {
    id: "p1",
    name: "Panadol",
    unit_price: 100,
    stock: 10,
    reorder_level: 2,
    category_name: "Analgesics",
    image_key: imageKey,
    posGroup: "standard",
  } as GroupedProduct & POSProduct;
  return render(<POSProductCard product={product} addToCart={() => {}} />);
}

function tileImage(container: HTMLElement) {
  return container.querySelector("img");
}

describe("POS tile product image", () => {
  beforeEach(() => {
    store.profile = {};
    useProductImageConfigStore.setState({ config: ENABLED });
  });

  it("shows the product image by default once the feature is configured", () => {
    const { container } = renderTile();

    expect(tileImage(container)?.getAttribute("src")).toBe(`https://img.example.test/${KEY}`);
    expect(tileImage(container)?.getAttribute("loading")).toBe("lazy");
  });

  it("shows the category icon when the store turned POS images off", () => {
    store.profile = { pos_show_product_images: 0 };

    const { container } = renderTile();

    expect(tileImage(container)).toBeNull();
    expect(screen.getByTestId("product-image-fallback")).toBeTruthy();
  });

  it("shows the category icon for a product without an image", () => {
    const { container } = renderTile(null);

    expect(tileImage(container)).toBeNull();
  });

  it("keeps the tile unchanged while the feature is not configured", () => {
    useProductImageConfigStore.setState({ config: PRODUCT_IMAGES_DISABLED });

    const { container } = renderTile();

    expect(tileImage(container)).toBeNull();
  });
});

describe("Register config: Show product images in POS grid", () => {
  const noop = () => {};
  function renderCard() {
    return render(
      <RegisterConfigCard
        requireSaleNotes={false}
        setRequireSaleNotes={noop}
        displayStockLevels
        setDisplayStockLevels={noop}
        uppercaseDisplayEnabled
        setUppercaseDisplayEnabled={noop}
      />,
    );
  }

  beforeEach(() => {
    store.profile = {};
    store.updateStoreProfile.mockClear();
    useProductImageConfigStore.setState({ config: ENABLED });
  });

  it("is hidden while product images are not configured", () => {
    useProductImageConfigStore.setState({ config: PRODUCT_IMAGES_DISABLED });

    renderCard();

    expect(screen.queryByLabelText("Show product images in POS grid")).toBeNull();
  });

  it("reads as on for a store that never set it", () => {
    renderCard();

    expect(screen.getByRole("switch", { name: "Show product images in POS grid" }).getAttribute("aria-checked")).toBe("true");
  });

  it("saves the store setting when switched off", () => {
    store.profile = { pos_show_product_images: 1 };
    renderCard();

    fireEvent.click(screen.getByRole("switch", { name: "Show product images in POS grid" }));

    expect(store.updateStoreProfile).toHaveBeenCalledWith({ pos_show_product_images: 0 });
  });
});
