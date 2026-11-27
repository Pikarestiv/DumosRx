import {
  BookOpen,
  Car,
  Check,
  Hammer,
  type LucideIcon,
  Pill,
  Shirt,
  ShoppingBasket,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Sprout,
  Store,
} from "lucide-react";

export const STORE_TYPES = [
  { value: "pharmacy", label: "Pharmacy", icon: Pill },
  { value: "supermarket", label: "Supermarket", icon: ShoppingCart },
  { value: "grocery", label: "Grocery", icon: ShoppingBasket },
  { value: "general", label: "General Store", icon: Check },
  { value: "beauty", label: "Beauty & Cosmetics", icon: Sparkles },
  { value: "hardware", label: "Hardware & Building Materials", icon: Hammer },
  { value: "fashion", label: "Fashion & Clothing", icon: Shirt },
  { value: "electronics", label: "Electronics & Phones", icon: Smartphone },
  { value: "auto_parts", label: "Auto Parts", icon: Car },
  { value: "stationery", label: "Stationery & Books", icon: BookOpen },
  { value: "agro", label: "Agro & Farm Supplies", icon: Sprout },
  { value: "other", label: "Other", icon: Store },
] as const satisfies readonly { value: string; label: string; icon: LucideIcon }[];

export type StoreType = (typeof STORE_TYPES)[number]["value"];

const KNOWN = new Set<string>(STORE_TYPES.map((type) => type.value));

export function normalizeStoreType(value?: string | null): StoreType {
  return value && KNOWN.has(value) ? (value as StoreType) : "general";
}
