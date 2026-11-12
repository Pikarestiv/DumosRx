"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { POSProduct as Product } from "@/lib/types/product";
import type { Service } from "@/lib/types/service";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { roundMoney } from "@/lib/utils/pos-calculations";

export interface CartItem extends Omit<Product, "stock"> {
  stock: number | null;
  item_type?: "product" | "service";
  product_id?: string;
  quantity: number;
  subtotal: number;
  original_unit_price: number;
  is_spot_sourced?: boolean;
  sourcing_cost?: number;
  sourcing_payment_source?: "cash_drawer" | "external";
  sourcing_partner?: string;
}

export interface AddToCartOptions {
  isSpotSourced?: boolean;
  sourcingCost?: number;
  paymentSource?: "cash_drawer" | "external";
  partner?: string;
  quantity?: number;
  sellingPrice?: number;
}

export interface SpotSourcingSplitOptions {
  isSplit?: boolean;
  shelfQuantity?: number;
  spotQuantity?: number;
}

export interface SpotSourcingConfig {
  isSpotSourced: boolean;
  sourcingCost?: number;
  paymentSource?: "cash_drawer" | "external";
  partner?: string;
  quantity?: number;
  sellingPrice?: number;
}

export interface RedeemedOption {
  id: string;
  label: string;
  pointsCost: number;
  discountValue: number;
}

export type MarkupType = "reseller" | "store";

interface POSCartState {
  cart: CartItem[];
  discount: number;
  discountType: "fixed" | "percentage";
  redeemedOption: RedeemedOption | null;
  isResellerSale: boolean;
  // Which kind of markup this is:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-pos-cart-ts-L42
  markupType: MarkupType | null;
  setCart: (cart: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
  setDiscount: (discount: number) => void;
  setDiscountType: (type: "fixed" | "percentage") => void;
  setRedeemedOption: (option: RedeemedOption | null) => void;
  setIsResellerSale: (value: boolean) => void;
  setMarkupType: (value: MarkupType | null) => void;
}

export const usePOSCartStore = create<POSCartState>()(
  persist(
    (set) => ({
      cart: [],
      discount: 0,
      discountType: "fixed",
      redeemedOption: null,
      isResellerSale: false,
      markupType: null,
      setCart: (updater) =>
        set((state) => ({
          cart: typeof updater === "function" ? updater(state.cart) : updater,
        })),
      setDiscount: (discount) => set({ discount }),
      setDiscountType: (discountType) => set({ discountType }),
      setRedeemedOption: (redeemedOption) => set({ redeemedOption }),
      setIsResellerSale: (isResellerSale) => set({ isResellerSale }),
      setMarkupType: (markupType) => set({ markupType }),
    }),
    {
      name: STORAGE_KEYS.posCart,
    }
  )
);

export function clearPOSCartStorage() {
  usePOSCartStore.setState({
    cart: [],
    discount: 0,
    discountType: "fixed",
    redeemedOption: null,
    isResellerSale: false,
    markupType: null,
  });
}

export function restorePOSCart(
  items: CartItem[],
  restoredDiscount?: number,
  restoredDiscountType?: "fixed" | "percentage",
  restoredMarkup?: { isResellerSale: boolean; markupType: MarkupType | null },
) {
  usePOSCartStore.setState({
    cart: items,
    redeemedOption: null,
    ...(restoredDiscount !== undefined ? { discount: restoredDiscount } : {}),
    ...(restoredDiscountType !== undefined ? { discountType: restoredDiscountType } : {}),
    ...(restoredMarkup
      ? { isResellerSale: restoredMarkup.isResellerSale, markupType: restoredMarkup.markupType }
      : {}),
  });
}

/** Below a tenth of a kobo two prices are the same price; anything coarser
 * re-prices a line on a float artefact and nags the cashier about it. */
const PRICE_EPSILON = 0.001;

export interface CartRepricing {
  /** The same array reference when nothing changed, so a caller can use
   * identity to decide whether to write state at all. */
  cart: CartItem[];
  /** Product names whose catalog selling price moved, for the warning. */
  repricedNames: string[];
}

// Re-points every cart line at the catalog's current selling price and average cost.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-pos-cart-L116
export function repriceCartFromCatalog(
  cart: CartItem[],
  products: Product[],
): CartRepricing {
  const repricedNames: string[] = [];
  let changed = false;

  const next = cart.map((item) => {
    if (item.item_type === "service") return item;
    const product = products.find((p) => p.id === (item.product_id || item.id));
    if (!product) return item;

    const unitPrice = roundMoney(Math.max(0, product.unit_price + (item.unit_price - item.original_unit_price)));
    const costPrice = product.cost_price ?? item.cost_price;

    const priceMoved =
      Math.abs(product.unit_price - item.original_unit_price) > PRICE_EPSILON;
    const costMoved =
      Math.abs((costPrice ?? 0) - (item.cost_price ?? 0)) > PRICE_EPSILON;
    if (!priceMoved && !costMoved) return item;

    if (priceMoved) repricedNames.push(product.name);
    changed = true;

    return {
      ...item,
      original_unit_price: product.unit_price,
      unit_price: unitPrice,
      cost_price: costPrice,
      subtotal: roundMoney(unitPrice * item.quantity),
    };
  });

  return { cart: changed ? next : cart, repricedNames };
}

export function buildNewCartItem(
  product: Product,
  options?: AddToCartOptions,
): CartItem {
  const initialQty = options?.quantity && options.quantity > 0 ? options.quantity : 1;
  const effectiveUnitPrice =
    options?.sellingPrice !== undefined
      ? Math.max(0, options.sellingPrice)
      : product.unit_price;
  return {
    ...product,
    quantity: initialQty,
    unit_price: effectiveUnitPrice,
    subtotal: roundMoney(effectiveUnitPrice * initialQty),
    original_unit_price: product.unit_price,
    ...(options?.isSpotSourced
      ? {
          is_spot_sourced: true,
          sourcing_cost: options.sourcingCost ?? product.cost_price ?? 0,
          sourcing_payment_source: options.paymentSource ?? "cash_drawer",
          sourcing_partner: options.partner ?? "",
        }
      : {}),
  };
}

export function applySpotSourcingConfig(
  item: CartItem,
  config: SpotSourcingConfig,
): CartItem {
  const nextQty = config.quantity && config.quantity > 0 ? config.quantity : item.quantity;
  const nextPrice =
    config.sellingPrice !== undefined
      ? Math.max(0, config.sellingPrice)
      : item.unit_price;
  return {
    ...item,
    quantity: nextQty,
    unit_price: nextPrice,
    subtotal: roundMoney(nextPrice * nextQty),
    is_spot_sourced: true,
    sourcing_cost: config.sourcingCost ?? item.sourcing_cost ?? item.cost_price ?? 0,
    sourcing_payment_source: config.paymentSource ?? item.sourcing_payment_source ?? "cash_drawer",
    sourcing_partner: config.partner ?? item.sourcing_partner ?? "",
  };
}

export function stripSpotSourcingConfig(
  item: CartItem,
  availableStock: number,
  canSellWithoutStock: boolean,
  isResellerSale: boolean,
): CartItem {
  const { is_spot_sourced: _iss, sourcing_cost: _sc, sourcing_payment_source: _sps, sourcing_partner: _sp, ...rest } = item;
  const nextQty = !canSellWithoutStock ? Math.min(rest.quantity, availableStock) : rest.quantity;
  const nextPrice = isResellerSale ? rest.unit_price : rest.original_unit_price;
  return {
    ...(rest as CartItem),
    quantity: nextQty,
    unit_price: nextPrice,
    subtotal: roundMoney(nextPrice * nextQty),
  };
}

export function updateCartSpotSourcing(
  cart: CartItem[],
  id: string,
  config: SpotSourcingConfig | null,
  availableStock: number,
  canSellWithoutStock: boolean,
  isResellerSale: boolean,
  splitOptions?: SpotSourcingSplitOptions,
): { cart: CartItem[]; removedName?: string } {
  if (!config || !config.isSpotSourced) {
    if (id.endsWith(":spot_sourced")) {
      const removed = cart.find((item) => item.id === id);
      return {
        cart: cart.filter((item) => item.id !== id),
        removedName: removed?.name || "Spot-sourced item",
      };
    }
    if (!canSellWithoutStock && availableStock <= 0) {
      const removed = cart.find((item) => item.id === id);
      return {
        cart: cart.filter((item) => item.id !== id),
        removedName: removed?.name || "Item",
      };
    }
    return {
      cart: cart.map((item) =>
        item.id === id
          ? stripSpotSourcingConfig(item, availableStock, canSellWithoutStock, isResellerSale)
          : item,
      ),
    };
  }

  if (
    splitOptions?.isSplit &&
    (splitOptions.shelfQuantity ?? 0) > 0 &&
    (splitOptions.spotQuantity ?? 0) > 0
  ) {
    const existing = cart.find((item) => item.id === id);
    if (!existing) return { cart };

    const baseProductId = existing.product_id || existing.id.replace(/:spot_sourced$/, "");
    const shelfQty = splitOptions.shelfQuantity!;
    const spotQty = splitOptions.spotQuantity!;
    const sellingPrice =
      config.sellingPrice !== undefined ? Math.max(0, config.sellingPrice) : existing.unit_price;

    const shelfLine: CartItem = {
      ...existing,
      id: baseProductId,
      product_id: baseProductId,
      quantity: shelfQty,
      subtotal: roundMoney(existing.unit_price * shelfQty),
      is_spot_sourced: undefined, sourcing_cost: undefined,
      sourcing_payment_source: undefined, sourcing_partner: undefined,
    };

    const spotLineId = `${baseProductId}:spot_sourced`;
    const spotLine: CartItem = {
      ...existing,
      id: spotLineId,
      product_id: baseProductId,
      quantity: spotQty,
      unit_price: sellingPrice,
      subtotal: roundMoney(sellingPrice * spotQty),
      is_spot_sourced: true,
      sourcing_cost: config.sourcingCost ?? existing.sourcing_cost ?? existing.cost_price ?? 0,
      sourcing_payment_source: config.paymentSource ?? existing.sourcing_payment_source ?? "cash_drawer",
      sourcing_partner: config.partner ?? existing.sourcing_partner ?? "",
    };

    const remainingCart = cart.filter(
      (item) => item.id !== id && item.id !== baseProductId && item.id !== spotLineId,
    );
    return {
      cart: [...remainingCart, shelfLine, spotLine],
    };
  }

  return {
    cart: cart.map((item) => (item.id === id ? applySpotSourcingConfig(item, config) : item)),
  };
}

export function buildNewServiceCartItem(
  service: Service,
  quantity = 1,
): CartItem {
  const effectiveQty = quantity > 0 ? quantity : 1;
  const price = Math.max(0, service.price);
  return {
    id: service.id,
    name: service.name,
    generic_name: service.category || "",
    strength: "",
    unit_price: price,
    original_unit_price: price,
    cost_price: 0,
    stock: null,
    quantity: effectiveQty,
    subtotal: roundMoney(price * effectiveQty),
    item_type: "service",
    is_spot_sourced: false,
    barcode: service.code || "",
    category_id: service.category || "",
  };
}
