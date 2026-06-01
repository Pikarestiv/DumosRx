import { useLocalData } from "@/lib/db/hooks/useLocalData";
import { CartItem } from "@/lib/hooks/use-pos-cart";
import { useMemo } from "react";

export function useSmartSuggestions(cart: CartItem[]) {
  // Extract categories of products in the cart
  const cartCategories = useMemo(() => {
    return cart.map((item) => item.category_id).filter(Boolean) as string[];
  }, [cart]);

  // Define target recommendation categories based on clinical and upsell triggers
  const targetCategories = useMemo(() => {
    if (cartCategories.length === 0) return [];
    
    const targets = new Set<string>();
    
    for (const cat of cartCategories) {
      const lowerCat = cat.toLowerCase();
      if (lowerCat.includes("antimalarial")) {
        targets.add("Vitamins");
        targets.add("Vitamins & Supplements");
        targets.add("Analgesics");
      } else if (lowerCat.includes("antibiotic")) {
        targets.add("Vitamins");
        targets.add("Vitamins & Supplements");
      } else if (lowerCat.includes("cough") || lowerCat.includes("cold")) {
        targets.add("Vitamins");
        targets.add("Vitamins & Supplements");
      } else if (lowerCat.includes("analgesic")) {
        targets.add("Antacids");
      }
    }
    
    return Array.from(targets);
  }, [cartCategories]);

  // Build SQLite query to retrieve in-stock matching products
  const { sql, params } = useMemo(() => {
    if (targetCategories.length === 0) {
      return { sql: "SELECT 1 WHERE 1=0", params: [] };
    }
    const placeholders = targetCategories.map(() => "?").join(", ");
    return {
      sql: `SELECT id, name, generic_name, brand_name as brand, strength, selling_price as unit_price, stock_quantity as stock, category_id FROM medicines WHERE category_id IN (${placeholders}) AND stock_quantity > 0 AND is_active = 1 AND _deleted = 0 LIMIT 10`,
      params: targetCategories
    };
  }, [targetCategories]);

  const { data: rawSuggestions, loading } = useLocalData<any>(sql, params);

  // Filter out items already in cart and format the result
  const suggestions = useMemo(() => {
    if (!rawSuggestions || rawSuggestions.length === 0) return [];
    const cartIds = new Set(cart.map((item) => item.id));
    return rawSuggestions
      .filter((item: any) => !cartIds.has(item.id))
      .map((m: any) => ({
        id: m.id,
        name: m.name,
        generic_name: m.generic_name || "",
        brand: m.brand || "",
        strength: m.strength || "",
        unit_price: m.unit_price || 0,
        stock: m.stock || 0,
        category_id: m.category_id || "",
      }))
      .slice(0, 3); // return top 3 recommendations
  }, [rawSuggestions, cart]);

  return { suggestions, loading };
}
