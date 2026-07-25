import { useMemo } from "react";
import { CartItem } from "@/lib/hooks/use-pos-cart";
import type { POSProduct as Product } from "@/lib/types/product";
import { SMART_SUGGESTIONS_RULES, SMART_SUGGESTIONS_CLUSTERS } from "@/lib/constants/smart-suggestions-rules";

// Category names are free-text and store-defined, so exact equality is too brittle
// (e.g. a store's "Pain Relief" category should still match a rule authored as
// "Analgesics" if either name contains the other). Substring matching in both
// directions is forgiving of that naming drift without being a full fuzzy-match.
function categoriesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

export function useSmartSuggestions(cart: CartItem[], products: Product[]) {
  const suggestions = useMemo(() => {
    if (cart.length === 0 || products.length === 0) return [];

    const targetCategories = new Set<string>();
    const targetNames = new Set<string>();
    const cartCategories = new Set<string>();

    // Process each cart item to find matched rules
    for (const item of cart) {
      const nameLower = item.name.toLowerCase();
      // Rules are authored against human-readable category names, not category_id (a UUID) — match on category_name.
      const categoryLower = item.category_name ? item.category_name.toLowerCase() : "";
      if (categoryLower) cartCategories.add(categoryLower);

      for (const rule of SMART_SUGGESTIONS_RULES) {
        let isMatched = false;

        // Match category (lenient substring match — see categoriesMatch)
        if (rule.triggerCategory && categoriesMatch(categoryLower, rule.triggerCategory.toLowerCase())) {
          isMatched = true;
        }

        // Match keyword
        if (rule.triggerKeywords && rule.triggerKeywords.some(keyword => nameLower.includes(keyword.toLowerCase()))) {
          isMatched = true;
        }

        if (isMatched) {
          if (rule.suggestedCategories) {
            rule.suggestedCategories.forEach(cat => targetCategories.add(cat.toLowerCase()));
          }
          if (rule.suggestedNames) {
            rule.suggestedNames.forEach(name => targetNames.add(name.toLowerCase()));
          }
        }
      }

      // Symptom/condition clusters: any category in the cluster suggests every
      // other category in the same cluster (bidirectional co-purchase, not a
      // one-way pairing).
      for (const cluster of SMART_SUGGESTIONS_CLUSTERS) {
        const clusterLower = cluster.map(c => c.toLowerCase());
        if (clusterLower.some(cat => categoriesMatch(categoryLower, cat))) {
          clusterLower.forEach(cat => targetCategories.add(cat));
        }
      }
    }

    const cartIds = new Set(cart.map(item => item.id));
    const inStockAndNotInCart = (product: Product) =>
      !cartIds.has(product.id) && product.stock > 0;

    // Rule-based cross-sell matches (category or keyword)
    const ruleMatches = products.filter((product) => {
      if (!inStockAndNotInCart(product)) return false;

      const medNameLower = product.name.toLowerCase();
      const medCatLower = product.category_name ? product.category_name.toLowerCase() : "";

      if (medCatLower && Array.from(targetCategories).some(cat => categoriesMatch(medCatLower, cat))) {
        return true;
      }
      return Array.from(targetNames).some(target => medNameLower.includes(target));
    });

    if (ruleMatches.length > 0) return ruleMatches.slice(0, 4);

    // Fallback: no curated rule fired (small/uncatalogued store) — suggest other
    // in-stock products from the same category as what's already in the cart,
    // so the feature stays useful even without a matching rule.
    if (cartCategories.size > 0) {
      const fallbackMatches = products.filter((product) => {
        if (!inStockAndNotInCart(product)) return false;
        const medCatLower = product.category_name ? product.category_name.toLowerCase() : "";
        return medCatLower && Array.from(cartCategories).some(cat => categoriesMatch(medCatLower, cat));
      });
      return fallbackMatches.slice(0, 4);
    }

    return [];
  }, [cart, products]);

  return { suggestions };
}
