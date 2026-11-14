import { describe, expect, it } from "vitest";

import { categoryIcon, categoryTint, correctCategoryName } from "@/lib/storefront-categories";
import { isPriceOnRequest, stockHint, whatsappLink } from "@/lib/storefront-product";

describe("storefront stock hint", () => {
  it("says in stock above the low-stock threshold and how many are left at or below it", () => {
    expect(stockHint({ stock_quantity: 6 })).toEqual({ kind: "in" });
    expect(stockHint({ stock_quantity: 5 })).toEqual({ kind: "low", left: 5 });
    expect(stockHint({ stock_quantity: 3 })).toEqual({ kind: "low", left: 3 });
  });

  it("says out of stock at zero or below, and never reports a fraction as nothing left", () => {
    expect(stockHint({ stock_quantity: 0 })).toEqual({ kind: "out" });
    expect(stockHint({ stock_quantity: -2 })).toEqual({ kind: "out" });
    expect(stockHint({ stock_quantity: 0.5 })).toEqual({ kind: "low", left: 1 });
  });

  it("falls back to the boolean flag for an API that predates the quantity, and says nothing without either", () => {
    expect(stockHint({ in_stock: true })).toEqual({ kind: "in" });
    expect(stockHint({ in_stock: false })).toEqual({ kind: "out" });
    expect(stockHint({})).toEqual({ kind: "unknown" });
  });
});

describe("storefront price on request", () => {
  it.each([0, "0", "0.00", -5, null, undefined, "", "abc", NaN])("treats %s as no price", (price) => {
    expect(isPriceOnRequest(price)).toBe(true);
  });

  it.each([1500, "1500.00", 0.5])("treats %s as a real price", (price) => {
    expect(isPriceOnRequest(price)).toBe(false);
  });
});

describe("storefront whatsapp link", () => {
  it("keeps only the digits of the number and encodes the message", () => {
    expect(whatsappLink("+237 6 00 00 00 00", "Hi, how much is Face Cream?")).toBe(
      "https://wa.me/237600000000?text=Hi%2C%20how%20much%20is%20Face%20Cream%3F",
    );
  });

  it("is absent when there is no usable number", () => {
    expect(whatsappLink(null)).toBeNull();
    expect(whatsappLink("")).toBeNull();
    expect(whatsappLink("call me")).toBeNull();
  });
});

describe("storefront category tiles", () => {
  it.each([
    ["Éclairage", "lighting"],
    ["Light Bulbs", "lighting"],
    ["Protection électrique", "electrical"],
    ["Pills & Supplements", "pill"],
    ["Nasal Sprays", "spray"],
    ["Face Creams", "jar"],
    ["Serums", "droplet"],
    ["Outillage", "tools"],
    ["Provisions", "basket"],
  ])("gives %s the %s icon", (name, icon) => {
    expect(categoryIcon(name)).toBe(icon);
  });

  it("uses the neutral box rather than guess when no keyword matches", () => {
    expect(categoryIcon("Boîtes & raccords")).toBe("box");
    expect(categoryIcon("")).toBe("box");
  });

  it("always gives a category the same tint, whatever its casing, and varies tints across categories", () => {
    expect(categoryTint("Lighting")).toBe(categoryTint("  lighting "));
    const tints = new Set(["Lighting", "Tools", "Provisions", "Serums", "Creams", "Drugs", "Sprays"].map(categoryTint));
    expect(tints.size).toBeGreaterThan(2);
  });

  it("fixes known typos from the seed data without touching other words", () => {
    expect(correctCategoryName("busicuit")).toBe("biscuit");
    expect(correctCategoryName("Busicuit Sweets")).toBe("Biscuit Sweets");
    expect(correctCategoryName("Lighting")).toBe("Lighting");
  });
});
