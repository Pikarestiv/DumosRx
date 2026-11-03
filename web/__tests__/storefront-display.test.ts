import { describe, it, expect } from "vitest";
import { storeAddressLine, toDisplayTitle } from "@/lib/storefront-display";

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
