import { useMemo } from "react";
import { searchProducts } from "@/lib/utils/search";
import type { POSProduct } from "@/lib/types/product";
import { UNCATEGORIZED_CATEGORY_VALUE } from "@/lib/constants/categories";

/** Category-then-search filtering for the POS product grid, plus the distinct category list used by the filter chips. */
export function usePOSProductFilter(
  products: POSProduct[],
  searchTerm: string,
  categoryFilter: string,
) {
  const categories = useMemo(() => {
    const names = new Set<string>();
    let hasUncategorized = false;
    for (const product of products) {
      if (product.category_name && product.category_name.trim().length > 0) {
        names.add(product.category_name);
      } else {
        hasUncategorized = true;
      }
    }
    const sorted = Array.from(names).sort((a, b) => a.localeCompare(b));
    if (hasUncategorized) {
      sorted.push(UNCATEGORIZED_CATEGORY_VALUE);
    }
    return sorted;
  }, [products]);

  const categoryFilteredProducts = useMemo(() => {
    if (categoryFilter === "all") return products;
    if (categoryFilter === UNCATEGORIZED_CATEGORY_VALUE) {
      return products.filter((p) => !p.category_name || p.category_name.trim() === "");
    }
    return products.filter((p) => p.category_name === categoryFilter);
  }, [products, categoryFilter]);

  const { results: filteredProducts, isFuzzyFallback } = useMemo(() => {
    return searchProducts(searchTerm, categoryFilteredProducts);
  }, [searchTerm, categoryFilteredProducts]);

  return { categories, filteredProducts, isFuzzyFallback };
}
