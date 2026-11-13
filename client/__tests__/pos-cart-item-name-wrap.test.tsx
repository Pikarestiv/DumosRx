import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("@/lib/hooks/use-permissions", () => ({
  useHasPermission: () => true,
}));
vi.mock("@/lib/hooks/use-uppercase-display", () => ({
  useUppercaseDisplayClass: () => "",
}));
import { POSCartItem } from "@/components/pos/pos-cart-item";
import type { CartItem } from "@/lib/hooks/use-pos-cart";

const LONG_NAME = "E2E Amoxicillin 500mg Capsules Blister Pack of 21";

function renderItem(overrides: Partial<CartItem> = {}) {
  const item = {
    id: "p1", product_id: "p1", name: LONG_NAME, quantity: 1, unit_price: 1200,
    original_unit_price: 1200, subtotal: 1200, stock: 10, ...overrides,
  } as unknown as CartItem;
  const removeFromCart = vi.fn();
  render(<POSCartItem item={item} isLast updateQuantity={vi.fn()} removeFromCart={removeFromCart} />);
  return { removeFromCart };
}

const nameButton = () => screen.getByRole("button", { name: LONG_NAME });

describe("POS cart line name at phone width (A-368)", () => {
  it.each([
    ["product", {}],
    ["service", { item_type: "service", stock: undefined }],
  ] as const)("lets a long %s name wrap to two lines instead of truncating it to one", (_kind, overrides) => {
    renderItem(overrides as Partial<CartItem>);

    const name = screen.getByText(LONG_NAME);
    expect(name.className).toContain("line-clamp-2");
    expect(name.className).toContain("break-words");
    expect(name.className).not.toMatch(/(^|\s)truncate(\s|$)/);
  });

  it.each([
    ["product", {}],
    ["service", { item_type: "service", stock: undefined }],
  ] as const)("reveals the full %s name in a tooltip when the name is focused", async (_kind, overrides) => {
    renderItem(overrides as Partial<CartItem>);

    fireEvent.focus(nameButton());

    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText(LONG_NAME)).toBeTruthy();
  });

  it("is a button named by the full product name that a tap expands and a second tap clamps again", () => {
    const { removeFromCart } = renderItem();

    const name = nameButton();
    expect(name.tagName).toBe("BUTTON");
    expect(name.getAttribute("type")).toBe("button");
    expect(name.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(name);
    expect(name.getAttribute("aria-expanded")).toBe("true");
    expect(name.className).not.toContain("line-clamp-2");

    fireEvent.click(name);
    expect(name.getAttribute("aria-expanded")).toBe("false");
    expect(name.className).toContain("line-clamp-2");
    expect(removeFromCart).not.toHaveBeenCalled();
  });

  it("keeps the quantity stepper and the line total at their full size", () => {
    renderItem();

    const stepper = screen.getByRole("spinbutton").parentElement as HTMLElement;
    expect(stepper.className).toContain("shrink-0");
    expect(screen.getByRole("spinbutton").className).toContain("w-9");
    expect(screen.getByText("₦1,200").className).toContain("min-w-[56px]");
  });
});
