import { describe, it, expect } from "vitest";
import { isOrderScreenRoute } from "@/lib/utils/order-screen-route";

describe("routes that show the full-screen order screen", () => {
  it("covers a new order and the address it is swapped to once saved", () => {
    expect(isOrderScreenRoute("/procurement/new")).toBe(true);
    expect(isOrderScreenRoute("/procurement/edit")).toBe(true);
    expect(isOrderScreenRoute("/procurement/edit/")).toBe(true);
  });

  it("leaves the order list and unrelated routes with the normal layout", () => {
    expect(isOrderScreenRoute("/procurement")).toBe(false);
    expect(isOrderScreenRoute("/procurement/editor-help")).toBe(false);
    expect(isOrderScreenRoute("/inventory")).toBe(false);
    expect(isOrderScreenRoute(null)).toBe(false);
  });
});
