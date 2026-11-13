import { describe, it, expect } from "vitest";
import { storeAddressLine, storeNameTextClass, toDisplayTitle } from "@/lib/storefront-display";

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

describe("storeNameTextClass", () => {
  it("keeps the full heading size for a short name", () => {
    expect(storeNameTextClass("Grace Pharmacy")).toBe("text-base sm:text-xl");
    expect(storeNameTextClass("a".repeat(16))).toBe("text-base sm:text-xl");
  });

  it("steps a medium name down on phones only", () => {
    expect(storeNameTextClass("Cutis Aesthetics & Med Spa")).toBe("text-sm sm:text-xl");
    expect(storeNameTextClass("a".repeat(28))).toBe("text-sm sm:text-xl");
  });

  it("steps a long name down everywhere so two lines fit the header", () => {
    expect(storeNameTextClass("Cutis Aesthetics & Med Spa and Wellness Centre")).toBe("text-sm sm:text-lg");
    expect(storeNameTextClass("a".repeat(29))).toBe("text-sm sm:text-lg");
  });

  it("measures the trimmed name", () => {
    expect(storeNameTextClass(`  ${"a".repeat(16)}  `)).toBe("text-base sm:text-xl");
  });
});
