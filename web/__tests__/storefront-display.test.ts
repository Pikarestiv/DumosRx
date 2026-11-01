import { describe, it, expect } from "vitest";
import { storeAddressLine, toDisplayTitle } from "@/lib/storefront-display";

describe("toDisplayTitle", () => {
  it.each([
    ["PARACETAMOL", "Paracetamol"],
    ["amoxicillin capsules", "Amoxicillin Capsules"],
    ["vitamin c  SYRUP", "Vitamin C  Syrup"],
    ["co-codamol (generic)", "Co-Codamol (Generic)"],
    ["PARACETAMOL 500MG", "Paracetamol 500MG"],
    ["Vitamin B12", "Vitamin B12"],
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
