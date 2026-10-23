import { getProductsWithStock } from "@/lib/db/queries/products";
import { getStockBatchStats, getLowStockAlerts } from "@/lib/db/queries/inventory";
import { hasPermission } from "@/lib/hooks/use-permissions";
import { searchProducts } from "@/lib/utils/search";
import { describeStock } from "@/lib/utils/stock-status";
import type { AssistantTool } from "../types";
import { formatMoney } from "../reply-formatters";

interface ProductStockResult {
  name: string;
  stock: number | null;
  reorderLevel: number | null;
  status: string;
  alternates: string[];
}

export const productStockTool: AssistantTool<{ product: string }, ProductStockResult | null> = {
  name: "product_stock",
  description: "Looks up on-hand quantity for a named product.",
  parameters: { product: { type: "string", description: "Product name to search for", required: true } },
  examples: ["how many paracetamol do we have", "is amoxicillin in stock"],
  execute: async ({ product }, ctx) => {
    const products = await getProductsWithStock();
    const [top, ...rest] = searchProducts(product, products).results;
    if (!top) return null;

    const canSeeQuantities = hasPermission(ctx.user, ctx.permissionGroup, "view_stock_quantities", "any");
    return {
      name: top.name,
      stock: canSeeQuantities ? top.stock : null,
      reorderLevel: canSeeQuantities && typeof top.reorder_level === "number" ? top.reorder_level : null,
      status: describeStock(top.stock, top.reorder_level, false).toLowerCase(),
      alternates: rest.slice(0, 3).map((p) => p.name),
    };
  },
  format: (result) => {
    if (!result) {
      return { kind: "fallback", text: "I couldn't find a product matching that name." };
    }

    let text = result.stock === null ? `${result.name}: ${result.status}` : `${result.name}: ${result.stock} in stock`;
    if (result.reorderLevel !== null) text += ` (reorder level: ${result.reorderLevel})`;
    if (result.alternates.length > 0) text += `. Did you mean one of: ${result.alternates.join(", ")}?`;

    return { kind: "answer", text };
  },
};

interface InventoryStatusResult {
  lowStockCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  stockValue: number;
  lowStockItems: { product: string }[];
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
      lowStockItems: lowStockAlerts.map((a) => ({ product: a.product })),
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
