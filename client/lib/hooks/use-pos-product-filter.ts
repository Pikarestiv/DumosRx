import { useMemo } from "react";
import { searchProducts } from "@/lib/utils/search";
import type { POSProduct } from "@/lib/types/product";

/** Category-then-search filtering for the POS product grid, plus the distinct category list used by the filter chips. */
export function usePOSProductFilter(products: POSProduct[], searchTerm: string, categoryFilter: string) {
  const categories = useMemo(() => {
    const names = new Set<string>();
    for (const product of products) {
      if (product.category_name) names.add(product.category_name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const categoryFilteredProducts = useMemo(() => {
    if (categoryFilter === "all") return products;
    return products.filter((p) => p.category_name === categoryFilter);
  }, [products, categoryFilter]);

  const { results: filteredProducts, isFuzzyFallback } = useMemo(() => {
    return searchProducts(searchTerm, categoryFilteredProducts);
  }, [searchTerm, categoryFilteredProducts]);

  return { categories, filteredProducts, isFuzzyFallback };
}
