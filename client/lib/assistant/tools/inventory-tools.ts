import { getProductsWithStock } from "@/lib/db/queries/products";
import { getStockBatchStats, getLowStockAlerts } from "@/lib/db/queries/inventory";
import { hasPermission } from "@/lib/hooks/use-permissions";
import { searchProducts } from "@/lib/utils/search";
import type { POSProduct } from "@/lib/types/product";
import type { AssistantTool } from "../types";
import { formatMoney } from "../reply-formatters";

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

interface InventoryStatusResult {
  lowStockCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  stockValue: number;
  lowStockItems: { product: string; quantity: number; threshold: number }[];
  includeValue: boolean;
}

export const inventoryStatusTool: AssistantTool<Record<string, never>, InventoryStatusResult> = {
  name: "inventory_status",
  description: "Reports low-stock, expiring-soon, and expired counts, and the top low-stock items.",
  parameters: {},
  examples: ["what's low on stock", "anything expiring soon", "inventory status"],
  execute: async (_args, ctx) => {
    const stats = await getStockBatchStats(ctx.expiryWarningDays);
    const lowStockAlerts = await getLowStockAlerts();
    const includeValue = hasPermission(ctx.user, ctx.permissionGroup, "view_cost_fields", "any");

    return {
      lowStockCount: stats.low_stock_count + stats.critical_stock_count,
      expiringSoonCount: stats.expiring_soon_count,
      expiredCount: stats.expired_count,
      stockValue: includeValue ? stats.total_stock_batch_value : 0,
      lowStockItems: lowStockAlerts.map((a) => ({
        product: a.product,
        quantity: a.quantity,
        threshold: a.threshold,
      })),
      includeValue,
    };
  },
  format: (result, _args, ctx) => {
    const parts = [
      `${result.lowStockCount} product(s) low on stock`,
      `${result.expiringSoonCount} expiring soon`,
      `${result.expiredCount} expired`,
    ];
    if (result.includeValue) {
      parts.push(`stock value: ${formatMoney(result.stockValue, ctx)}`);
    }

    let text = parts.join(", ") + ".";
    if (result.lowStockCount > 0 && result.lowStockItems.length > 0) {
      const names = result.lowStockItems.map((i) => i.product).join(", ");
      text += ` Low-stock alerts include: ${names}.`;
    }

    return { kind: "answer", text };
  },
};
