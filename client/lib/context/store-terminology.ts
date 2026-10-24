import type { StoreType } from "@/lib/context/store-types";

export const terminology: Record<StoreType, Record<string, string>> = {
  pharmacy: {
    product: "Product",
    products: "Products",
    registration_number: "NAFDAC Number",
    category: "Therapeutic Class",
    stock: "Stock Level",
  },
  grocery: {
    product: "Item",
    products: "Items",
    registration_number: "Registration No.",
    category: "Department",
    stock: "Quantity",
  },
  supermarket: {
    product: "Product",
    products: "Products",
    registration_number: "Reg. Number",
    category: "Aisle/Category",
    stock: "Stock",
  },
  retail: {
    product: "Product",
    products: "Products",
    registration_number: "Reg. No",
    category: "Category",
    stock: "Stock",
  },
};
