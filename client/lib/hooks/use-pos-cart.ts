"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";
import { useStore } from "@/lib/context/store-context";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { useDisplayName } from "@/lib/hooks/use-uppercase-display";
import { useStockVisibility } from "@/lib/hooks/use-stock-visibility";
import { formatInsufficientStock } from "@/lib/utils/stock-status";
import {
  calculateSubtotal,
  calculateTax,
  calculateDiscountAmount,
  calculateTotal,
} from "@/lib/utils/pos-calculations";
export type { POSProduct as Product } from "@/lib/types/product";
import type { POSProduct as Product } from "@/lib/types/product";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { roundMoney } from "@/lib/utils/pos-calculations";

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

export function usePOSCart(products: Product[]) {
  const { vatPercentage } = useStore();
  const { canUseLoyaltyProgram } = useFeatureGate();
  const { canSeeQuantities } = useStockVisibility();
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

  // A manual discount edit and a loyalty redemption share the same discount slot (by design, to keep a single source of truth for "the" discount…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-cart-ts-L170
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

  // Re-price against the catalog rather than at checkout:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-cart-ts-L212
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

  // A redemption already staged in cart state can outlive the gate that allowed it — a plan downgrade, or an admin flipping the store's on/off t…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-cart-ts-L232
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
  // VAT must be charged on the net-of-discount amount (this covers loyalty redemptions too, since they share this same discount slot — see redee…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-cart-ts-L250
  const tax = useMemo(
    () => calculateTax(Math.max(0, subtotal - calculatedDiscount), vatPercentage),
    [subtotal, calculatedDiscount, vatPercentage]
  );
  const total = useMemo(
    () => calculateTotal(subtotal, tax, calculatedDiscount),
    [subtotal, tax, calculatedDiscount]
  );

  const displayName = useDisplayName();

  const removeFromCart = useCallback(
    (id: string) => {
      const removed = cart.find((item) => item.id === id);
      setCart((prev) => prev.filter((item) => item.id !== id));
      if (!removed) return;
      // A swipe-to-remove is easy to trigger by accident while scrolling the
      // cart on a phone, so every removal is reversible rather than silent.
      toast(`${displayName(removed.name)} removed from cart`, {
        action: {
          label: "Undo",
          onClick: () =>
            setCart((prev) =>
              prev.some((item) => item.id === removed.id) ? prev : [...prev, removed],
            ),
        },
      });
    },
    [cart, setCart, displayName],
  );

  const updateQuantity = useCallback(
    (id: string, newQuantity: number) => {
      if (newQuantity <= 0) {
        removeFromCart(id);
        return;
      }

      const product = products.find((m) => m.id === id);
      if (product && newQuantity > product.stock) {
        toast.warning(formatInsufficientStock(product.stock, canSeeQuantities));
        return;
      }

      setCart((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                quantity: newQuantity,
                subtotal: roundMoney(item.unit_price * newQuantity),
              }
            : item,
        ),
      );
    },
    [products, setCart, removeFromCart, canSeeQuantities],
  );

  const addToCart = useCallback(
    (product: Product) => {
      const existingItem = cart.find((item) => item.id === product.id);

      if (existingItem) {
        if (existingItem.quantity < product.stock) {
          updateQuantity(product.id, existingItem.quantity + 1);
        } else {
          toast.warning(formatInsufficientStock(product.stock, canSeeQuantities));
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
        toast.success(`${displayName(product.name)} added to cart`);
      } else {
        toast.error("This item is out of stock");
      }
    },
    [cart, setCart, updateQuantity, displayName, canSeeQuantities],
  );

  const updateUnitPrice = useCallback(
    (id: string, newPrice: number) => {
      setCart((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          const clamped = Math.max(newPrice, 0);
          return { ...item, unit_price: clamped, subtotal: roundMoney(clamped * item.quantity) };
        }),
      );
    },
    [setCart],
  );

  const setIsResellerSale = useCallback(
    (value: boolean) => {
      setStoreIsResellerSale(value);
      if (!value) {
        // Turning reseller mode off with marked-up prices still in the cart would silently keep charging the marked-up amount with no commission track…
        // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-cart-ts-L362
        setCart((prev) =>
          prev.map((item) => ({
            ...item,
            unit_price: item.original_unit_price,
            subtotal: roundMoney(item.original_unit_price * item.quantity),
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
      // A held transaction never persisted a redemption (only its resulting discount amount), so any redemption tag from before this restore is now…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-cart-ts-L393
      setRedeemedOption(null);
      if (restoredDiscount !== undefined) setStoreDiscount(restoredDiscount);
      if (restoredDiscountType !== undefined) setStoreDiscountType(restoredDiscountType);
      // The raw store setter, not setIsResellerSale:
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-cart-ts-L399
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
