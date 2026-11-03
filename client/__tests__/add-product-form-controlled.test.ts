import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/queries/products", () => ({ getSupplierNames: vi.fn() }));

import { applyProductFormChange, emptyProductForm } from "@/components/products/add-product-form-state";

describe("applyProductFormChange", () => {
  it("defaults a new product to shown online", () => {
    expect(emptyProductForm().showOnline).toBe(true);
  });

  it("unticks Show Online when the product is marked controlled", () => {
    const next = applyProductFormChange(emptyProductForm(), "isControlled", true);
    expect(next.isControlled).toBe(true);
    expect(next.showOnline).toBe(false);
  });

  it("leaves Show Online alone when controlled is cleared", () => {
    const controlled = { ...emptyProductForm(), isControlled: true, showOnline: false };
    expect(applyProductFormChange(controlled, "isControlled", false).showOnline).toBe(false);
  });

  it("changes only the field it is given otherwise", () => {
    const next = applyProductFormChange(emptyProductForm(), "name", "Panadol");
    expect(next.name).toBe("Panadol");
    expect(next.showOnline).toBe(true);
  });
});

