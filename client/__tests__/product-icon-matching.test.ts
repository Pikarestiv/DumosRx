import { describe, it, expect } from "vitest";
import {
  Bath,
  Beer,
  Candy,
  Cog,
  Cookie,
  Droplets,
  Flower2,
  HeartPulse,
  Layers,
  Leaf,
  Package,
  Pill,
  Scissors,
  SprayCan,
  Syringe,
  Wheat,
  Wine,
} from "lucide-react";
import { getCategoryIcon } from "@/lib/constants/category-icons";
import { getProductIcon } from "@/lib/constants/product-icons";

describe("category icons for the real catalog categories", () => {
  it.each([
    ["perfume", Flower2],
    ["perfumes", Flower2],
    ["body lotion", Droplets],
    ["body wash", Bath],
    ["bar soap", Bath],
    ["soap", Bath],
    ["body spray", SprayCan],
    ["face wipes", Layers],
    ["pasta", Wheat],
    ["sweet", Candy],
    ["busicuit", Cookie],
    ["machine", Cog],
    ["uncategorized", Package],
    ["supplements", Leaf],
  ])("%s", (category, icon) => {
    expect(getCategoryIcon(category)).toBe(icon);
  });

  it("does not match short keywords inside longer words", () => {
    expect(getCategoryIcon("Carpet")).not.toBe(getCategoryIcon("Pet"));
  });
});

describe("product name refines the icon only inside its category family", () => {
  it("a carrot skincare product is not a vegetable", () => {
    expect(getProductIcon("bar soap", "Asantee Carrot With Honey Bar Soap")).toBe(Bath);
    expect(getProductIcon("body lotion", "Amanda Carrot")).toBe(Droplets);
  });

  it("uses the name inside broad categories", () => {
    expect(getProductIcon("drugs", "10ml Syringe")).toBe(Syringe);
    expect(getProductIcon("drugs", "Amoxil Capsules")).toBe(Pill);
    expect(getProductIcon("cosmetics", "2 Black Avocado 500g Relaxer")).toBe(Scissors);
    expect(getProductIcon("provision", "Divella Spaghetti")).toBe(Wheat);
    expect(getProductIcon("wine", "4th Street Red Wine")).toBe(Wine);
    expect(getProductIcon("beverages", "Amstel Malt Beer")).toBe(Beer);
    expect(getProductIcon("machine", "Aneroid Sphygomanometer")).toBe(HeartPulse);
    expect(getProductIcon("perfume", "212 Men Perfume")).toBe(Flower2);
  });

  it("falls back to the category icon when the name has no rule", () => {
    expect(getProductIcon("body wash", "Alpha Skin Care Moisturizing Sea Mist")).toBe(Bath);
    expect(getProductIcon("machine", "Chocolate Maker")).toBe(Cog);
  });

  it("reads the name when the category itself is unrecognised", () => {
    expect(getProductIcon("zzz-unknown", "Pain Relief Tablets")).toBe(Pill);
  });

  it("handles a missing category and name", () => {
    expect(getProductIcon(undefined, undefined)).toBe(Package);
  });
});
