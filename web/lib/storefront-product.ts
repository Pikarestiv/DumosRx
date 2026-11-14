import type { StorefrontProduct } from "@/lib/types/storefront";

export const LOW_STOCK_THRESHOLD = 5;

export type StockHint = { kind: "unknown" } | { kind: "in" } | { kind: "low"; left: number } | { kind: "out" };

export function stockHint(product: Pick<StorefrontProduct, "stock_quantity" | "in_stock">): StockHint {
  const { stock_quantity: quantity, in_stock: inStock } = product;
  if (typeof quantity === "number") {
    if (quantity <= 0) return { kind: "out" };
    return quantity <= LOW_STOCK_THRESHOLD ? { kind: "low", left: Math.floor(quantity) || 1 } : { kind: "in" };
  }
  if (inStock === false) return { kind: "out" };
  return inStock ? { kind: "in" } : { kind: "unknown" };
}

export function isPriceOnRequest(price: string | number | null | undefined): boolean {
  const amount = typeof price === "number" ? price : parseFloat(String(price ?? ""));
  return !Number.isFinite(amount) || amount <= 0;
}

export function whatsappLink(number: string | null | undefined, message?: string): string | null {
  const digits = (number ?? "").replace(/\D/g, "");
  if (digits === "") return null;
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

export function withoutStock(product: StorefrontProduct): StorefrontProduct {
  const rest = { ...product };
  delete rest.stock_quantity;
  delete rest.in_stock;
  return rest;
}
