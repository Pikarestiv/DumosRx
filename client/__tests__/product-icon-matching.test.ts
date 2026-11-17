import { describe, it, expect } from "vitest";
import {
  Baby,
  Bath,
  Beer,
  Bug,
  Candy,
  Citrus,
  Cog,
  Cookie,
  CupSoda,
  Droplet,
  Droplets,
  Fish,
  Flower2,
  HeartPulse,
  Layers,
  Leaf,
  Milk,
  Package,
  Pill,
  Scissors,
  ShieldPlus,
  Shirt,
  Smile,
  SprayCan,
  Sun,
  Syringe,
  Thermometer,
  Wheat,
  Wind,
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
    expect(getProductIcon("drugs", "Flucamed Cap 100mg")).toBe(Pill);
    expect(getProductIcon("cosmetics", "2 Black Avocado 500g Relaxer")).toBe(Scissors);
    expect(getProductIcon("provision", "Divella Spaghetti")).toBe(Wheat);
    expect(getProductIcon("wine", "4th Street Red Wine")).toBe(Wine);
    expect(getProductIcon("beverages", "Amstel Malt Beer")).toBe(Beer);
    expect(getProductIcon("machine", "Aneroid Sphygomanometer")).toBe(HeartPulse);
    expect(getProductIcon("perfume", "212 Men Perfume")).toBe(Flower2);
  });

  it.each([
    ["drugs", "Lonart DS", Bug],
    ["drugs", "Coartem Adult", Bug],
    ["drugs", "Augmentin 625mg", ShieldPlus],
    ["drugs", "Zithromax Suspension", Droplet],
    ["drugs", "Ceftriaxone Inj", Syringe],
    ["drugs", "Daravite Woman 50 Plus", Citrus],
    ["drugs", "Apple Cider Gummies", Candy],
    ["drugs", "Digital Thermometer", Thermometer],
    ["drugs", "Amlodipine 10mg", HeartPulse],
    ["drugs", "Ventoline Inhaler", Wind],
    ["drugs", "Kids Multivitamine Gummies", Citrus],
    ["toiletries", "Baygon Insecticide 750ml", Bug],
    ["toiletries", "Good Mama 500g Detergent", Shirt],
    ["toiletries", "Colgate Toothpaste S/s", Smile],
    ["toiletries", "Softcare Pampers Size 3", Baby],
    ["toiletries", "Swiss Gel Airfreshner", Wind],
    ["toiletries", "Dettol 250ml", SprayCan],
    ["perfume", "24k Bodyspray Big", SprayCan],
    ["perfume", "Cool Breeze Smart Roll On", SprayCan],
    ["perfume", "Mousulf Perfume M/s", Flower2],
    ["cosmetics", "Nivea Sunscreen", Sun],
    ["cosmetics", "Veet Hair Removal", Scissors],
    ["cosmetics", "Dr Rashael Shower Gel Bath", Bath],
    ["cosmetics", "Angel Wipes By 35", Layers],
    ["provision", "Indomie Hungryman", Wheat],
    ["provision", "Peak Milk Tin 400g", Milk],
    ["provision", "Titus Sardine", Fish],
    ["provision", "Golden Penny Spaghetti", Wheat],
    ["provision", "Kings 5litres Oil", Droplet],
    ["beverages", "Fanta Can", CupSoda],
    ["beverages", "Guiness Stout Can", Beer],
    ["beverages", "Viju Yoghurt", Milk],
  ])("%s / %s", (category, name, icon) => {
    expect(getProductIcon(category, name)).toBe(icon);
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
