import { getProductsWithStock } from "@/lib/db/queries/products";
import { searchProducts } from "@/lib/utils/search";
import type { POSProduct } from "@/lib/types/product";
import type { AssistantTool } from "../types";

export const productStockTool: AssistantTool<{ product: string }, POSProduct[] | null> = {
  name: "product_stock",
  description: "Looks up on-hand quantity for a named product.",
  parameters: { product: { type: "string", description: "Product name to search for", required: true } },
  examples: ["how many paracetamol do we have", "is amoxicillin in stock"],
  execute: async ({ product }) => {
    const products = await getProductsWithStock();
    const { results } = searchProducts(product, products);
    return results.length > 0 ? results : null;
  },
  format: (result) => {
    if (!result || result.length === 0) {
      return { kind: "fallback", text: "I couldn't find a product matching that name." };
    }

    const top = result[0];
    let text = `${top.name}: ${top.stock} in stock`;
    if (typeof top.reorder_level === "number") text += ` (reorder level: ${top.reorder_level})`;

    if (result.length > 1) {
      const alternates = result.slice(1, 4).map((p) => p.name).join(", ");
      text += `. Did you mean one of: ${alternates}?`;
    }

    return { kind: "answer", text };
  },
};
