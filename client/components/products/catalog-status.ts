import { formatFilterLabel } from "@/components/ui/filter-pill";
import { getExpiryStatus } from "@/lib/utils/date-utils";
import type { Product } from "./types";

export function catalogStatusLabel(status: string, counts: { owed: number; duplicates: number; missingExpiry: number }): string {
  if (status === "stock_owed") return `Stock Owed (${counts.owed})`;
  if (status === "possible_duplicates") return `Possible Duplicates (${counts.duplicates})`;
  if (status === "missing_expiry") return `Missing Expiry (${counts.missingExpiry})`;
  return formatFilterLabel(status);
}

interface StatusContext {
  owedByProduct: ReadonlyMap<string, number>;
  duplicateIds: ReadonlySet<string>;
}

export function matchesCatalogStatus(product: Product, status: string, { owedByProduct, duplicateIds }: StatusContext): boolean {
  if (status === "all" || product.status === status) return true;
  switch (status) {
    case "low_stock":
      return product.stockQuantity <= product.reorderLevel;
    case "expired":
      return !!product.expiryDate && new Date(product.expiryDate) < new Date();
    case "expiring_soon":
      return !!product.expiryDate && getExpiryStatus(product.expiryDate) === "expiring_soon";
    case "missing_expiry":
      return (product.missingExpiryBatches ?? 0) > 0;
    case "stock_owed":
      return (owedByProduct.get(product.id) ?? 0) > 0;
    case "possible_duplicates":
      return duplicateIds.has(product.id);
    default:
      return false;
  }
}
