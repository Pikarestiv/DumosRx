import { describe, it, expect } from "vitest";
import { findDuplicateProductIds, findDuplicateProducts } from "@/lib/utils/duplicate-product";

const catalog = [
  { id: "1", name: "E45 Lotion", strength: "200ml", barcode: "5000000000011", category_name: "Skin Care" },
  { id: "2", name: "Panadol", strength: "", barcode: "" },
];

describe("findDuplicateProducts", () => {
  it("matches the same name and strength regardless of case and spacing", () => {
    const { sameName } = findDuplicateProducts({ name: "  e45   LOTION ", strength: "200ML" }, catalog);
    expect(sameName?.id).toBe("1");
  });

  it("treats a different strength as a different product", () => {
    expect(findDuplicateProducts({ name: "E45 Lotion", strength: "500ml" }, catalog).sameName).toBeNull();
  });

  it("matches a name with no strength against a catalog product with none", () => {
    expect(findDuplicateProducts({ name: "panadol" }, catalog).sameName?.id).toBe("2");
  });

  it("does not match a named product when the new one has no strength but the catalog one does", () => {
    expect(findDuplicateProducts({ name: "E45 Lotion" }, catalog).sameName).toBeNull();
  });

  it("ignores the product being edited", () => {
    const result = findDuplicateProducts({ id: "1", name: "E45 Lotion", strength: "200ml", barcode: "5000000000011" }, catalog);
    expect(result).toEqual({ sameName: null, sameBarcode: null });
  });

  it("flags an exact barcode reuse but never an empty barcode", () => {
    expect(findDuplicateProducts({ name: "Other", barcode: "5000000000011" }, catalog).sameBarcode?.id).toBe("1");
    expect(findDuplicateProducts({ name: "Other", barcode: "" }, catalog).sameBarcode).toBeNull();
  });

  it("finds nothing for a blank name", () => {
    expect(findDuplicateProducts({ name: "   " }, catalog).sameName).toBeNull();
  });
});

describe("findDuplicateProductIds", () => {
  it("flags every product that shares a name and strength or a barcode, and nothing else", () => {
    const ids = findDuplicateProductIds([
      { id: "a", name: "E45 Lotion", strength: "200ml" },
      { id: "b", name: " e45  lotion ", strength: "200ML" },
      { id: "c", name: "E45 Lotion", strength: "500ml" },
      { id: "d", name: "Panadol", barcode: "123" },
      { id: "e", name: "Paracetamol", barcode: "123" },
      { id: "f", name: "Unique", barcode: "999" },
    ]);
    expect([...ids].sort()).toEqual(["a", "b", "d", "e"]);
  });

  it("never treats products with blank barcodes as sharing one", () => {
    const ids = findDuplicateProductIds([
      { id: "a", name: "One", barcode: "" },
      { id: "b", name: "Two", barcode: null },
    ]);
    expect(ids.size).toBe(0);
  });
});
