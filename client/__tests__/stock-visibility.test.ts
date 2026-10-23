import { describe, it, expect } from "vitest";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  describeStock,
  formatInsufficientStock,
  lowStockThreshold,
  stockLevel,
} from "@/lib/utils/stock-status";

describe("stockLevel", () => {
  it("treats zero and below as out of stock", () => {
    expect(stockLevel(0, 5)).toBe("out");
    expect(stockLevel(-2, 5)).toBe("out");
  });

  it("is low from 1 up to the reorder level, inclusive", () => {
    expect(stockLevel(1, 5)).toBe("low");
    expect(stockLevel(5, 5)).toBe("low");
    expect(stockLevel(6, 5)).toBe("in");
  });

  it("falls back to a threshold of 10 when the reorder level is missing or zero", () => {
    expect(DEFAULT_LOW_STOCK_THRESHOLD).toBe(10);
    expect(lowStockThreshold(null)).toBe(10);
    expect(lowStockThreshold(undefined)).toBe(10);
    expect(lowStockThreshold(0)).toBe(10);
    expect(stockLevel(10, null)).toBe("low");
    expect(stockLevel(11, null)).toBe("in");
  });
});

describe("describeStock", () => {
  it.each([
    [0, 5, true, "Out of stock"],
    [0, 5, false, "Out of stock"],
    [3, 5, true, "3 left"],
    [3, 5, false, "Low stock"],
    [40, 5, true, "40 left"],
    [40, 5, false, "In stock"],
    [10, null, false, "Low stock"],
    [11, null, false, "In stock"],
  ])("qty %s, reorder %s, canSee %s -> %s", (qty, reorder, canSee, expected) => {
    expect(describeStock(qty, reorder, canSee)).toBe(expected);
  });

  it("never prints a digit without the permission", () => {
    for (const qty of [-1, 0, 1, 7, 10, 11, 999]) {
      expect(describeStock(qty, 10, false)).not.toMatch(/\d/);
    }
  });
});

describe("formatInsufficientStock", () => {
  it("keeps today's wording with the permission", () => {
    expect(formatInsufficientStock(1, true)).toBe("Insufficient stock — only 1 unit available");
    expect(formatInsufficientStock(4, true)).toBe("Insufficient stock — only 4 units available");
  });

  it("names no number without it", () => {
    expect(formatInsufficientStock(4, false)).toBe("Not enough stock for that quantity");
  });
});
