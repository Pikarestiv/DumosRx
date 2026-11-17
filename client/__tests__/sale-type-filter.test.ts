import { describe, it, expect } from "vitest";
import { matchesSaleTypeFilter } from "@/lib/utils/sale-type-filter";

const sale = (overrides: Record<string, unknown> = {}) => ({
  is_reseller_sale: 0,
  markup_type: null,
  has_product_lines: 0,
  has_service_lines: 0,
  ...overrides,
});

describe("Recent Sales sale-type filter", () => {
  const productOnly = sale({ has_product_lines: 1 });
  const serviceOnly = sale({ has_service_lines: 1 });
  const mixed = sale({ has_product_lines: 1, has_service_lines: 1 });
  const empty = sale();

  it("keeps every sale when no type is chosen", () => {
    expect([productOnly, serviceOnly, mixed, empty].every((s) => matchesSaleTypeFilter(s, "All"))).toBe(true);
  });

  it("shows sales with a product line under Product and with a service line under Service, mixed under both", () => {
    expect([productOnly, serviceOnly, mixed, empty].map((s) => matchesSaleTypeFilter(s, "Product"))).toEqual([true, false, true, false]);
    expect([productOnly, serviceOnly, mixed, empty].map((s) => matchesSaleTypeFilter(s, "Service"))).toEqual([false, true, true, false]);
  });

  it("separates plain reseller sales from store-markup reseller sales", () => {
    const reseller = sale({ is_reseller_sale: 1, markup_type: "reseller" });
    const storeMarkup = sale({ is_reseller_sale: 1, markup_type: "store" });

    expect([reseller, storeMarkup, productOnly].map((s) => matchesSaleTypeFilter(s, "Reseller"))).toEqual([true, false, false]);
    expect([reseller, storeMarkup, productOnly].map((s) => matchesSaleTypeFilter(s, "StoreMarkup"))).toEqual([false, true, false]);
  });

  it("treats a row from a query without the line flags as matching neither kind", () => {
    const legacy = { is_reseller_sale: 0, markup_type: null };
    expect(matchesSaleTypeFilter(legacy, "Product")).toBe(false);
    expect(matchesSaleTypeFilter(legacy, "Service")).toBe(false);
  });
});
