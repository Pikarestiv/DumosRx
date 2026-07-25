import { useMemo } from "react";
import { CartItem } from "@/lib/hooks/use-pos-cart";
import type { POSProduct as Product } from "@/lib/types/product";
import { SMART_SUGGESTIONS_RULES } from "@/lib/constants/smart-suggestions-rules";

export function useSmartSuggestions(cart: CartItem[], products: Product[]) {
  const suggestions = useMemo(() => {
    if (cart.length === 0 || products.length === 0) return [];

    const targetCategories = new Set<string>();
    const targetNames = new Set<string>();

    // Process each cart item to find matched rules
    for (const item of cart) {
      const nameLower = item.name.toLowerCase();
      // Rules are authored against human-readable category names, not category_id (a UUID) — match on category_name.
      const categoryLower = item.category_name ? item.category_name.toLowerCase() : "";

      for (const rule of SMART_SUGGESTIONS_RULES) {
        let isMatched = false;

        // Match category
        if (rule.triggerCategory && categoryLower === rule.triggerCategory.toLowerCase()) {
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
    }

    if (targetCategories.size === 0 && targetNames.size === 0) return [];

    const cartIds = new Set(cart.map(item => item.id));

    // Filter in-stock products matching recommended categories or names
    return products.filter(product => {
      // Must not already be in the cart
      if (cartIds.has(product.id)) return false;

      // Must be in stock
      if (product.stock <= 0) return false;

      const medNameLower = product.name.toLowerCase();
      const medCatLower = product.category_name ? product.category_name.toLowerCase() : "";

      // Match category
      if (targetCategories.has(medCatLower)) return true;

      // Match name by checking if it contains the target keyword
      return Array.from(targetNames).some(target => medNameLower.includes(target));
    }).slice(0, 4); // return top 4 recommendations
  }, [cart, products]);

  return { suggestions };
}
