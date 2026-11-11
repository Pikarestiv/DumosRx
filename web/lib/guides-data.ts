import type { GuideItem, GuideCategory } from "./guides/types";
import { POS_GUIDES } from "./guides/pos-guides";
import { INVENTORY_GUIDES } from "./guides/inventory-guides";
import { FINANCE_GUIDES } from "./guides/finance-guides";
import { OPERATIONS_GUIDES } from "./guides/operations-guides";

export * from "./guides/types";

export const GUIDES: GuideItem[] = [
  ...POS_GUIDES,
  ...INVENTORY_GUIDES,
  ...FINANCE_GUIDES,
  ...OPERATIONS_GUIDES,
];

export const GUIDE_CATEGORIES: GuideCategory[] = [
  "Point of Sale",
  "Inventory",
  "Reports & Finance",
  "Multi-Store",
  "Device & Security",
  "Online Storefront",
];

export function getGuideBySlug(slug: string): GuideItem | undefined {
  return GUIDES.find((g) => g.id === slug);
}
