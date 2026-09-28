import { describe, it, expect } from "vitest";
import { searchProducts } from "@/lib/utils/search";

/**
 * searchProducts() re-lowercased every product's name, generic name and barcode
 * on every call, so a catalog of ~800 products allocated ~2400 strings per
 * keystroke - and the Levenshtein fallback tier did it a second time. The
 * lowercased index is now cached against the products array reference.
 */
describe("searchProducts lowercase index caching", () => {
  function instrumented(name: string, generic: string, barcode: string) {
    const reads = { name: 0, generic_name: 0, barcode: 0 };
    const product = {
      id: name,
      get name() {
        reads.name += 1;
        return name;
      },
      get generic_name() {
        reads.generic_name += 1;
        return generic;
      },
      get barcode() {
        reads.barcode += 1;
        return barcode;
      },
    };
    return { product, reads };
  }

  it("does not re-read the searchable fields on a repeat call with the same array", () => {
    const a = instrumented("Paracetamol", "Acetaminophen", "12345");
    const b = instrumented("Amoxicillin", "Amoxicillin", "67890");
    const products = [a.product, b.product];

    searchProducts("para", products);
    const afterFirst = { ...a.reads };

    searchProducts("amox", products);

    expect(a.reads.generic_name).toBe(afterFirst.generic_name);
    expect(a.reads.barcode).toBe(afterFirst.barcode);
  });

  it("indexes a new array reference rather than serving the old one", () => {
    const first = [
      { id: "1", name: "Paracetamol", generic_name: "Acetaminophen", barcode: "1" },
    ];
    const second = [
      { id: "2", name: "Ibuprofen", generic_name: "Ibuprofen", barcode: "2" },
    ];

    expect(searchProducts("para", first).results).toHaveLength(1);
    expect(searchProducts("para", second).results).toHaveLength(0);
    expect(searchProducts("ibup", second).results[0].id).toBe("2");
  });

  it("still matches case-insensitively through the cached index", () => {
    const products = [
      { id: "1", name: "PARACETAMOL", generic_name: "ACETAMINOPHEN", barcode: "ABC123" },
    ];

    expect(searchProducts("paracetamol", products).results).toHaveLength(1);
    expect(searchProducts("acetaminophen", products).results).toHaveLength(1);
    expect(searchProducts("abc123", products).results).toHaveLength(1);
  });

  it("still falls back to fuzzy matching through the cached index", () => {
    const products = [
      { id: "1", name: "Paracetamol", generic_name: "Acetaminophen", barcode: "1" },
    ];

    const result = searchProducts("paracetamoll", products);
    expect(result.isFuzzyFallback).toBe(true);
    expect(result.results[0].id).toBe("1");
  });

  it("tolerates missing generic name and barcode", () => {
    const products = [{ id: "1", name: "Panadol" }];
    expect(searchProducts("panadol", products).results).toHaveLength(1);
    expect(searchProducts("panadoll", products).isFuzzyFallback).toBe(true);
  });
});
