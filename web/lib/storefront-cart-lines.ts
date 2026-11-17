import type { CartItem } from "@/lib/store/use-cart-store";

export const isServiceLine = (item: CartItem) => item.kind === "service";

export const checkoutLine = (item: CartItem) =>
  isServiceLine(item) ? { service_id: item.id, quantity: item.quantity } : { product_id: item.id, quantity: item.quantity };
