import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductImage } from "@/components/products/product-image";
import {
  PRODUCT_IMAGES_DISABLED,
  productImageUrl,
  useProductImageConfigStore,
} from "@/lib/product-images/config-store";

const KEY = "stores/s1/products/p1/abc.webp";
const ENABLED = { ...PRODUCT_IMAGES_DISABLED, enabled: true, public_base_url: "https://img.example.test/" };

function renderImage(props: Partial<Parameters<typeof ProductImage>[0]> = {}) {
  return render(<ProductImage imageKey={KEY} categoryName="Analgesics" alt="Panadol" sizePx={56} {...props} />);
}

describe("ProductImage", () => {
  beforeEach(() => {
    useProductImageConfigStore.setState({ config: ENABLED });
  });

  it("renders the CDN image lazily with fixed dimensions when configured", () => {
    renderImage();

    const img = screen.getByRole("img", { name: "Panadol" });
    expect(img.getAttribute("src")).toBe(`https://img.example.test/${KEY}`);
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("width")).toBe("56");
    expect(img.getAttribute("height")).toBe("56");
  });

  it("falls back to the category icon when the product has no image", () => {
    renderImage({ imageKey: null });

    expect(screen.queryByRole("img", { name: "Panadol" })).toBeNull();
    expect(screen.getByTestId("product-image-fallback")).toBeTruthy();
  });

  it("falls back when the feature is not configured, even with a key", () => {
    useProductImageConfigStore.setState({ config: PRODUCT_IMAGES_DISABLED });

    renderImage();

    expect(screen.getByTestId("product-image-fallback")).toBeTruthy();
  });

  it("falls back when the store turned images off for this surface", () => {
    renderImage({ showImage: false });

    expect(screen.getByTestId("product-image-fallback")).toBeTruthy();
  });

  it("falls back when the image fails to load (offline and uncached, CDN down)", () => {
    renderImage();

    fireEvent.error(screen.getByRole("img", { name: "Panadol" }));

    expect(screen.queryByRole("img", { name: "Panadol" })).toBeNull();
    expect(screen.getByTestId("product-image-fallback")).toBeTruthy();
  });

  it("tries again when the product gets a new image after a failed one", () => {
    const { rerender } = renderImage();
    fireEvent.error(screen.getByRole("img", { name: "Panadol" }));

    rerender(<ProductImage imageKey="stores/s1/products/p1/new.webp" categoryName="Analgesics" alt="Panadol" sizePx={56} />);

    expect(screen.getByRole("img", { name: "Panadol" }).getAttribute("src")).toContain("new.webp");
  });
});

describe("productImageUrl", () => {
  it("joins the base URL and key with exactly one slash", () => {
    expect(productImageUrl(ENABLED, KEY)).toBe(`https://img.example.test/${KEY}`);
  });

  it("is null without a key or while disabled", () => {
    expect(productImageUrl(ENABLED, "")).toBeNull();
    expect(productImageUrl(PRODUCT_IMAGES_DISABLED, KEY)).toBeNull();
  });
});
