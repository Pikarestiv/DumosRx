import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Bath, Candy } from "lucide-react";
import { ProductImage } from "@/components/products/product-image";
import { getProductIcon } from "@/lib/constants/product-icons";
import {
  PRODUCT_IMAGES_DISABLED,
  useProductImageConfigStore,
} from "@/lib/product-images/config-store";

const KEY = "stores/s1/products/p1/abc.webp";
const SRC = `https://img.example.test/${KEY}`;

describe("ProductImage zoom", () => {
  beforeEach(() => {
    useProductImageConfigStore.setState({
      config: { ...PRODUCT_IMAGES_DISABLED, enabled: true, public_base_url: "https://img.example.test" },
    });
  });

  it("opens an enlarged view from the full-image button and closes it with Escape", () => {
    render(<ProductImage imageKey={KEY} alt="Dettol" productName="Dettol" sizePx={112} zoom="full" />);

    fireEvent.click(screen.getByRole("button", { name: "View larger image of Dettol" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector("img")?.getAttribute("src")).toBe(SRC);

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the corner zoom does not trigger the surrounding click", () => {
    const outer = vi.fn();
    render(
      <div onClick={outer}>
        <ProductImage imageKey={KEY} alt="" productName="Dettol" sizePx={56} zoom="corner" />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "View larger image of Dettol" }));

    expect(outer).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("offers no zoom when the image fails and the icon is shown", () => {
    const { container } = render(<ProductImage imageKey={KEY} alt="" productName="Dettol" sizePx={56} zoom="corner" />);

    fireEvent.error(container.querySelector("img") as HTMLImageElement);

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByTestId("product-image-fallback")).toBeTruthy();
  });

  it("the fallback icon is chosen from the product name as well as the category", () => {
    expect(getProductIcon("toiletries", "Dettol Soap")).toBe(Bath);
    expect(getProductIcon("drugs", "Apple Cider Gummies")).toBe(Candy);
  });
});
