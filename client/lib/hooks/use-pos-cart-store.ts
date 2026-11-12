"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { POSProduct as Product } from "@/lib/types/product";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { roundMoney } from "@/lib/utils/pos-calculations";

export interface CartItem extends Product {
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

// Clears the persisted POS cart (cart items, discount, redeemed reward, reseller flag) both in memory and in localStorage.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-cart-ts-L78
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
    const product = products.find((p) => p.id === item.id);
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
  const { is_spot_sourced, sourcing_cost, sourcing_payment_source, sourcing_partner, ...rest } = item;
  const nextQty = !canSellWithoutStock ? Math.min(rest.quantity, availableStock) : rest.quantity;
  const nextPrice = isResellerSale ? rest.unit_price : rest.original_unit_price;
  return {
    ...(rest as CartItem),
    quantity: nextQty,
    unit_price: nextPrice,
    subtotal: roundMoney(nextPrice * nextQty),
  };
}
