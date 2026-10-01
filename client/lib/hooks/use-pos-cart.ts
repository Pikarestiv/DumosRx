"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";
import { useStore } from "@/lib/context/store-context";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import {
  calculateSubtotal,
  calculateTax,
  calculateDiscountAmount,
  calculateTotal,
} from "@/lib/utils/pos-calculations";
export type { POSProduct as Product } from "@/lib/types/product";
import type { POSProduct as Product } from "@/lib/types/product";
import { STORAGE_KEYS } from "@/lib/storage-keys";

export interface CartItem extends Product {
  quantity: number;
  subtotal: number;
  original_unit_price: number;
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
  /** Which kind of markup this is: a real reseller/agent (commission owed)
   * or a store-kept markup. Only meaningful while isResellerSale is true;
   * null until the cashier picks one (see pos-cart.tsx). */
  markupType: MarkupType | null;
  setCart: (cart: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
  setDiscount: (discount: number) => void;
  setDiscountType: (type: "fixed" | "percentage") => void;
  setRedeemedOption: (option: RedeemedOption | null) => void;
  setIsResellerSale: (value: boolean) => void;
  setMarkupType: (value: MarkupType | null) => void;
}

const usePOSCartStore = create<POSCartState>()(
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

// Clears the persisted POS cart (cart items, discount, redeemed reward,
// reseller flag) both in memory and in localStorage. A plain
// `localStorage.removeItem("pos-cart-storage")` alone is NOT enough: this
// store's zustand module only rehydrates from storage once, on creation, so
// the in-memory cart state would survive untouched (and the very next cart
// mutation would just re-persist it, undoing the removal). Call this at
// every point the app tears down one session's context for another's —
// logout, the lock-screen "switch user" flow, and a store switch — so a
// shared terminal's next cashier (or the newly-active store) never inherits
// a cart staged against the outgoing session.
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

export function formatInsufficientStock(availableStock: number) {
  return `Insufficient stock — only ${availableStock} unit${availableStock === 1 ? "" : "s"} available`;
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

/**
 * Re-points every cart line at the catalog's current selling price and
 * average cost. The cart is a `persist`ed store, so a line otherwise keeps
 * whatever the product cost and sold for at the moment it was added — a cart
 * held overnight, or held across a price change synced from the owner's
 * device, charged yesterday's price and booked COGS at yesterday's average
 * cost.
 *
 * A line whose product isn't in `products` is left exactly as it is: that is
 * the catalog still loading (`usePOSData` returns `[]` until its query
 * resolves) far more often than it is a deleted product, and silently
 * re-pricing against a catalog that hasn't arrived is worse than the staleness
 * this fixes.
 *
 * A reseller markup is carried across as a markup, not as an absolute price:
 * the cashier agreed a margin over the shelf price with the reseller, and
 * `unit_price` may never fall below `original_unit_price` (updateUnitPrice's
 * own floor), which the new catalog price has just moved.
 */
export function repriceCartFromCatalog(
  cart: CartItem[],
  products: Product[],
): CartRepricing {
  const repricedNames: string[] = [];
  let changed = false;

  const next = cart.map((item) => {
    const product = products.find((p) => p.id === item.id);
    if (!product) return item;

    const markup = Math.max(0, item.unit_price - item.original_unit_price);
    const unitPrice = product.unit_price + markup;
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
      subtotal: unitPrice * item.quantity,
    };
  });

  return { cart: changed ? next : cart, repricedNames };
}

export function usePOSCart(products: Product[]) {
  const { vatPercentage } = useStore();
  const { canUseLoyaltyProgram } = useFeatureGate();
  const cart = usePOSCartStore((state) => state.cart);
  const setCart = usePOSCartStore((state) => state.setCart);
  const discount = usePOSCartStore((state) => state.discount);
  const setStoreDiscount = usePOSCartStore((state) => state.setDiscount);
  const discountType = usePOSCartStore((state) => state.discountType);
  const setStoreDiscountType = usePOSCartStore((state) => state.setDiscountType);
  const redeemedOption = usePOSCartStore((state) => state.redeemedOption);
  const setRedeemedOption = usePOSCartStore((state) => state.setRedeemedOption);
  const isResellerSale = usePOSCartStore((state) => state.isResellerSale);
  const setStoreIsResellerSale = usePOSCartStore((state) => state.setIsResellerSale);
  const markupType = usePOSCartStore((state) => state.markupType);
  const setMarkupType = usePOSCartStore((state) => state.setMarkupType);
  const [isHydrated, setIsHydrated] = useState(false);

  // A manual discount edit and a loyalty redemption share the same discount
  // slot (by design, to keep a single source of truth for "the" discount) —
  // editing the discount by hand while a reward is redeemed detaches it from
  // that reward, since the point cost no longer corresponds to what's typed.
  const setDiscount = useCallback(
    (value: number) => {
      setStoreDiscount(value);
      setRedeemedOption(null);
    },
    [setStoreDiscount, setRedeemedOption],
  );
  const setDiscountType = useCallback(
    (type: "fixed" | "percentage") => {
      setStoreDiscountType(type);
      setRedeemedOption(null);
    },
    [setStoreDiscountType, setRedeemedOption],
  );

  const redeemReward = useCallback(
    (option: { id: string; label: string; points_cost: number; discount_value: number }) => {
      setStoreDiscount(option.discount_value);
      setStoreDiscountType("fixed");
      setRedeemedOption({
        id: option.id,
        label: option.label,
        pointsCost: option.points_cost,
        discountValue: option.discount_value,
      });
    },
    [setStoreDiscount, setStoreDiscountType, setRedeemedOption],
  );

  const clearRedemption = useCallback(() => {
    setStoreDiscount(0);
    setRedeemedOption(null);
  }, [setStoreDiscount, setRedeemedOption]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Re-price against the catalog rather than at checkout: every figure the
  // cashier and the customer see (line subtotal, cart subtotal, VAT, total,
  // the amount tendered and the change due) is derived from these lines, so
  // correcting a price at checkout would charge an amount that was never on
  // screen. Correcting it the moment the new catalog arrives keeps all of
  // them consistent and gives the cashier a chance to tell the customer.
  // Idempotent by design — it returns the same array when nothing moved —
  // so re-running it on every cart change costs one pass and settles.
  useEffect(() => {
    if (products.length === 0) return;
    const { cart: repriced, repricedNames } = repriceCartFromCatalog(cart, products);
    if (repriced === cart) return;
    setCart(repriced);
    if (repricedNames.length > 0) {
      toast.warning(
        `Price updated from the catalog: ${repricedNames.join(", ")}`,
      );
    }
  }, [products, cart, setCart]);

  // A redemption already staged in cart state can outlive the gate that
  // allowed it — a plan downgrade, or an admin flipping the store's on/off
  // toggle in another tab, mid-session. If that happens while a reward is
  // staged, clear it immediately rather than letting checkout complete with
  // a redemption the store is no longer entitled/willing to honor; the
  // discount it applied is cleared along with it via clearRedemption().
  useEffect(() => {
    if (!canUseLoyaltyProgram && redeemedOption) {
      clearRedemption();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseLoyaltyProgram, redeemedOption]);

  const subtotal = useMemo(() => calculateSubtotal(cart), [cart]);
  const calculatedDiscount = useMemo(
    () => calculateDiscountAmount(subtotal, discount, discountType),
    [subtotal, discount, discountType]
  );
  // VAT must be charged on the net-of-discount amount (this covers loyalty
  // redemptions too, since they share this same discount slot — see
  // redeemReward() above) — otherwise a discounted/redeemed sale is
  // overcharged VAT on money the customer was never actually charged.
  const tax = useMemo(
    () => calculateTax(Math.max(0, subtotal - calculatedDiscount), vatPercentage),
    [subtotal, calculatedDiscount, vatPercentage]
  );
  const total = useMemo(
    () => calculateTotal(subtotal, tax, calculatedDiscount),
    [subtotal, tax, calculatedDiscount]
  );

  const removeFromCart = useCallback(
    (id: string) => {
      const removed = cart.find((item) => item.id === id);
      setCart((prev) => prev.filter((item) => item.id !== id));
      if (!removed) return;
      // A swipe-to-remove is easy to trigger by accident while scrolling the
      // cart on a phone, so every removal is reversible rather than silent.
      toast(`${removed.name} removed from cart`, {
        action: {
          label: "Undo",
          onClick: () =>
            setCart((prev) =>
              prev.some((item) => item.id === removed.id) ? prev : [...prev, removed],
            ),
        },
      });
    },
    [cart, setCart],
  );

  const updateQuantity = useCallback(
    (id: string, newQuantity: number) => {
      if (newQuantity <= 0) {
        removeFromCart(id);
        return;
      }

      const product = products.find((m) => m.id === id);
      if (product && newQuantity > product.stock) {
        toast.warning(formatInsufficientStock(product.stock));
        return;
      }

      setCart((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                quantity: newQuantity,
                subtotal: item.unit_price * newQuantity,
              }
            : item,
        ),
      );
    },
    [products, setCart, removeFromCart],
  );

  const addToCart = useCallback(
    (product: Product) => {
      const existingItem = cart.find((item) => item.id === product.id);

      if (existingItem) {
        if (existingItem.quantity < product.stock) {
          updateQuantity(product.id, existingItem.quantity + 1);
        } else {
          toast.warning(formatInsufficientStock(product.stock));
        }
        return;
      }

      if (product.stock > 0) {
        const cartItem: CartItem = {
          ...product,
          quantity: 1,
          subtotal: product.unit_price,
          original_unit_price: product.unit_price,
        };
        setCart((prev) => [...prev, cartItem]);
        toast.success(`${product.name} added to cart`);
      } else {
        toast.error("This item is out of stock");
      }
    },
    [cart, setCart, updateQuantity],
  );

  const updateUnitPrice = useCallback(
    (id: string, newPrice: number) => {
      setCart((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          // A reseller sale can only mark price up, never down - clamped here
          // too, not just in the input's `min`, so a pasted/typed value below
          // the floor can't get through either.
          const clamped = Math.max(newPrice, item.original_unit_price);
          return { ...item, unit_price: clamped, subtotal: clamped * item.quantity };
        }),
      );
    },
    [setCart],
  );

  const setIsResellerSale = useCallback(
    (value: boolean) => {
      setStoreIsResellerSale(value);
      if (!value) {
        // Turning reseller mode off with marked-up prices still in the cart
        // would silently keep charging the marked-up amount with no
        // commission tracked for it - revert every line back to normal.
        setCart((prev) =>
          prev.map((item) => ({
            ...item,
            unit_price: item.original_unit_price,
            subtotal: item.original_unit_price * item.quantity,
          })),
        );
        setMarkupType(null);
      }
    },
    [setStoreIsResellerSale, setCart, setMarkupType],
  );

  const clearCart = useCallback(() => {
    setCart([]);
    setDiscount(0);
    setStoreIsResellerSale(false);
    setMarkupType(null);
  }, [setCart, setDiscount, setStoreIsResellerSale, setMarkupType]);

  const restoreCart = useCallback(
    (
      items: CartItem[],
      restoredDiscount?: number,
      restoredDiscountType?: "fixed" | "percentage",
      restoredMarkup?: { isResellerSale: boolean; markupType: MarkupType | null },
    ) => {
      setCart(items);
      // A held transaction never persisted a redemption (only its resulting
      // discount amount), so any redemption tag from before this restore is
      // now stale and must not carry over.
      setRedeemedOption(null);
      if (restoredDiscount !== undefined) setStoreDiscount(restoredDiscount);
      if (restoredDiscountType !== undefined) setStoreDiscountType(restoredDiscountType);
      // The raw store setter, not setIsResellerSale: that wrapper reverts every
      // line to original_unit_price when switching the flag off, which would
      // undo the markup this restore is carrying.
      if (restoredMarkup) {
        setStoreIsResellerSale(restoredMarkup.isResellerSale);
        setMarkupType(restoredMarkup.markupType);
      }
    },
    [
      setCart,
      setRedeemedOption,
      setStoreDiscount,
      setStoreDiscountType,
      setStoreIsResellerSale,
      setMarkupType,
    ],
  );

  return {
    cart: isHydrated ? cart : [],
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    restoreCart,
    subtotal: isHydrated ? subtotal : 0,
    tax: isHydrated ? tax : 0,
    total: isHydrated ? total : 0,
    discount: isHydrated ? discount : 0,
    discountType: isHydrated ? discountType : "fixed",
    calculatedDiscount: isHydrated ? calculatedDiscount : 0,
    setDiscount,
    setDiscountType,
    redeemedOption: isHydrated ? redeemedOption : null,
    redeemReward,
    clearRedemption,
    updateUnitPrice,
    isResellerSale: isHydrated ? isResellerSale : false,
    setIsResellerSale,
    markupType: isHydrated ? markupType : null,
    setMarkupType,
  };
}
