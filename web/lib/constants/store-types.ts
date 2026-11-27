export const STORE_TYPES = [
  { value: "pharmacy", label: "Pharmacy" },
  { value: "supermarket", label: "Supermarket" },
  { value: "grocery", label: "Grocery" },
  { value: "general", label: "General Store" },
  { value: "beauty", label: "Beauty & Cosmetics" },
  { value: "hardware", label: "Hardware & Building Materials" },
  { value: "fashion", label: "Fashion & Clothing" },
  { value: "electronics", label: "Electronics & Phones" },
  { value: "auto_parts", label: "Auto Parts" },
  { value: "stationery", label: "Stationery & Books" },
  { value: "agro", label: "Agro & Farm Supplies" },
  { value: "other", label: "Other" },
] as const;

export type StoreTypeValue = (typeof STORE_TYPES)[number]["value"];

export const STORE_TYPE_VALUES = STORE_TYPES.map((type) => type.value) as [StoreTypeValue, ...StoreTypeValue[]];
