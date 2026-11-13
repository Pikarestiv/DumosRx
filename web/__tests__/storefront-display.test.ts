import { describe, it, expect } from "vitest";
import { hasContactDetails, storeAddressLine, toDisplayTitle, viewAllProductsLabel } from "@/lib/storefront-display";

describe("toDisplayTitle", () => {
  it.each([
    ["PARACETAMOL", "Paracetamol"],
    ["amoxicillin capsules", "Amoxicillin Capsules"],
    ["co-codamol (generic)", "Co-Codamol (Generic)"],
    ["PARACETAMOL 500MG", "Paracetamol 500MG"],
    ["COARTEM DS", "Coartem DS"],
    ["ORS SACHET", "ORS Sachet"],
    ["HIV TEST KIT", "HIV Test Kit"],
    ["hiv test kit", "HIV Test Kit"],
    ["AMOXIL CAP", "Amoxil Cap"],
    ["ORS (SACHET)", "ORS (Sachet)"],
    ["MILK OF MAGNESIA", "Milk of Magnesia"],
    ["milk of magnesia", "Milk of Magnesia"],
    ["OF MICE", "OF Mice"],
    ["Vitamin B12", "Vitamin B12"],
    ["vitamin c  SYRUP", "vitamin c  SYRUP"],
    ["GlaxoSmithKline Panadol", "GlaxoSmithKline Panadol"],
    ["Augmentin BD", "Augmentin BD"],
    ["", ""],
  ])("renders %j as %j", (raw, expected) => {
    expect(toDisplayTitle(raw)).toBe(expected);
  });
});

describe("storeAddressLine", () => {
  it("joins a street address and a distinct location", () => {
    expect(storeAddressLine({ address: "12 Allen Avenue", location: "Ikeja, Lagos" })).toBe(
      "12 Allen Avenue, Ikeja, Lagos",
    );
  });

  it("shows one of them when the other is missing or the same", () => {
    expect(storeAddressLine({ address: null, location: "Ikeja" })).toBe("Ikeja");
    expect(storeAddressLine({ address: "Ikeja", location: " ikeja " })).toBe("Ikeja");
  });

  it("returns null when the store has neither", () => {
    expect(storeAddressLine({ address: "  ", location: null })).toBeNull();
  });
});

describe("hasContactDetails", () => {
  it("ignores a phone or email that is only whitespace", () => {
    expect(hasContactDetails({ phone: " ", email: "\t", address: null, location: "  " })).toBe(false);
  });

  it("counts a real phone or email", () => {
    expect(hasContactDetails({ phone: " 0803 000 0000 ", email: null })).toBe(true);
    expect(hasContactDetails({ phone: "", email: "shop@example.com" })).toBe(true);
  });
});

describe("viewAllProductsLabel", () => {
  it("uses the singular for one product", () => {
    expect(viewAllProductsLabel(1, 1)).toBe("View all 1 product");
  });

  it("uses the plural otherwise", () => {
    expect(viewAllProductsLabel(2, 12)).toBe("View all 12 products");
  });
});
