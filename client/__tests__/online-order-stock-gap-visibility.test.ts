import { describe, it, expect, vi } from "vitest";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

import { describeStockGap } from "@/lib/hooks/use-fulfill-online-order-mutation";

const gap = { productId: "p1", productName: "Amoxil", requested: 12, available: 4 };

describe("online order shortfall line and view_stock_quantities", () => {
  it("names the sellable quantity with the permission", () => {
    expect(describeStockGap(gap, true)).toBe("Amoxil — ordered 12, sellable 4");
  });

  it("names only what was ordered without it", () => {
    const line = describeStockGap(gap, false);
    expect(line).toBe("Amoxil — ordered 12, not enough in stock");
    expect(line).not.toContain("4");
  });
});
