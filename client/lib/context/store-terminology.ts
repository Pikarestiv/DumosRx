import type { StoreType } from "@/lib/constants/store-types";

type Terminology = Record<string, string>;

const GENERAL: Terminology = {
  product: "Product",
  products: "Products",
  registration_number: "Reg. No",
  category: "Category",
  stock: "Stock",
};

const BY_TYPE = new Map<string, Terminology>([
  [
    "pharmacy",
    { product: "Product", products: "Products", registration_number: "NAFDAC Number", category: "Category", stock: "Stock Level" },
  ],
  [
    "grocery",
    { product: "Item", products: "Items", registration_number: "Registration No.", category: "Department", stock: "Quantity" },
  ],
  [
    "supermarket",
    { product: "Product", products: "Products", registration_number: "Reg. Number", category: "Aisle/Category", stock: "Stock" },
  ],
]);

export function terminology(type: StoreType): Terminology {
  return BY_TYPE.get(type) ?? GENERAL;
}
