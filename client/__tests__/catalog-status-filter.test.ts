import { describe, it, expect } from "vitest";
import { catalogStatusLabel, matchesCatalogStatus } from "@/components/products/catalog-status";
import type { Product } from "@/components/products/types";

const product = (fields: Partial<Product>): Product =>
  ({ id: "p1", name: "Panadol", status: "active", stockQuantity: 50, reorderLevel: 10, ...fields }) as Product;

const context = (owed: [string, number][] = [], duplicates: string[] = []) => ({
  owedByProduct: new Map(owed),
  duplicateIds: new Set(duplicates),
});

describe("matchesCatalogStatus", () => {
  it("shows everything for all", () => {
    expect(matchesCatalogStatus(product({}), "all", context())).toBe(true);
  });

  it("includes only flagged products for possible_duplicates", () => {
    expect(matchesCatalogStatus(product({ id: "a" }), "possible_duplicates", context([], ["a"]))).toBe(true);
    expect(matchesCatalogStatus(product({ id: "b" }), "possible_duplicates", context([], ["a"]))).toBe(false);
  });

  it("includes low stock at or below the reorder level", () => {
    expect(matchesCatalogStatus(product({ stockQuantity: 10 }), "low_stock", context())).toBe(true);
    expect(matchesCatalogStatus(product({ stockQuantity: 11 }), "low_stock", context())).toBe(false);
  });

  it("includes stock owed only when something is owed", () => {
    expect(matchesCatalogStatus(product({ id: "a" }), "stock_owed", context([["a", 3]]))).toBe(true);
    expect(matchesCatalogStatus(product({ id: "a" }), "stock_owed", context())).toBe(false);
  });

  it("includes expired products with a past expiry date", () => {
    expect(matchesCatalogStatus(product({ expiryDate: "2020-01-01" }), "expired", context())).toBe(true);
    expect(matchesCatalogStatus(product({ expiryDate: "2999-01-01" }), "expired", context())).toBe(false);
  });

  it("includes missing expiry only for a product with at least one stocked batch that has no expiry date", () => {
    expect(matchesCatalogStatus(product({ missingExpiryBatches: 2 }), "missing_expiry", context())).toBe(true);
    expect(matchesCatalogStatus(product({ missingExpiryBatches: 0 }), "missing_expiry", context())).toBe(false);
    expect(matchesCatalogStatus(product({}), "missing_expiry", context())).toBe(false);
  });

  it("labels the missing expiry filter with how many products it will show", () => {
    expect(catalogStatusLabel("missing_expiry", { owed: 0, duplicates: 0, missingExpiry: 7 })).toBe("Missing Expiry (7)");
  });
});
