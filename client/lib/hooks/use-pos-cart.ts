"use client";

import { useState, useMemo, useEffect } from "react";
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

export interface CartItem extends Product {
  quantity: number;
  subtotal: number;
}

export interface RedeemedOption {
  id: string;
  label: string;
  pointsCost: number;
  discountValue: number;
}

interface POSCartState {
  cart: CartItem[];
  discount: number;
  discountType: "fixed" | "percentage";
  redeemedOption: RedeemedOption | null;
  setCart: (cart: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
  setDiscount: (discount: number) => void;
  setDiscountType: (type: "fixed" | "percentage") => void;
  setRedeemedOption: (option: RedeemedOption | null) => void;
}

const usePOSCartStore = create<POSCartState>()(
  persist(
    (set) => ({
      cart: [],
      discount: 0,
      discountType: "fixed",
      redeemedOption: null,
      setCart: (updater) =>
        set((state) => ({
          cart: typeof updater === "function" ? updater(state.cart) : updater,
        })),
      setDiscount: (discount) => set({ discount }),
      setDiscountType: (discountType) => set({ discountType }),
      setRedeemedOption: (redeemedOption) => set({ redeemedOption }),
    }),
    {
      name: "pos-cart-storage",
    }
  )
);

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
  const [isHydrated, setIsHydrated] = useState(false);

  // A manual discount edit and a loyalty redemption share the same discount
  // slot (by design, to keep a single source of truth for "the" discount) —
  // editing the discount by hand while a reward is redeemed detaches it from
  // that reward, since the point cost no longer corresponds to what's typed.
  const setDiscount = (value: number) => {
    setStoreDiscount(value);
    setRedeemedOption(null);
  };
  const setDiscountType = (type: "fixed" | "percentage") => {
    setStoreDiscountType(type);
    setRedeemedOption(null);
  };

  const redeemReward = (option: { id: string; label: string; points_cost: number; discount_value: number }) => {
    setStoreDiscount(option.discount_value);
    setStoreDiscountType("fixed");
    setRedeemedOption({
      id: option.id,
      label: option.label,
      pointsCost: option.points_cost,
      discountValue: option.discount_value,
    });
  };

  const clearRedemption = () => {
    setStoreDiscount(0);
    setRedeemedOption(null);
  };

  useEffect(() => {
    setIsHydrated(true);
  }, []);

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
  const tax = useMemo(() => calculateTax(subtotal, vatPercentage), [subtotal, vatPercentage]);
  const calculatedDiscount = useMemo(
    () => calculateDiscountAmount(subtotal, discount, discountType),
    [subtotal, discount, discountType]
  );
  const total = useMemo(
    () => calculateTotal(subtotal, tax, calculatedDiscount),
    [subtotal, tax, calculatedDiscount]
  );

  const addToCart = (product: Product) => {
    const existingItem = cart.find((item) => item.id === product.id);

    if (existingItem) {
      if (existingItem.quantity < product.stock) {
        updateQuantity(product.id, existingItem.quantity + 1);
      } else {
        toast.warning("Insufficient stock available");
      }
    } else {
      if (product.stock > 0) {
        const cartItem: CartItem = {
          ...product,
          quantity: 1,
          subtotal: product.unit_price,
        };
        setCart((prev) => [...prev, cartItem]);
        toast.success(`${product.name} added to cart`);
      } else {
        toast.error("This item is out of stock");
      }
    }
  };

  const updateQuantity = (id: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(id);
      return;
    }

    const product = products.find((m) => m.id === id);
    if (product && newQuantity > product.stock) {
      toast.warning("Insufficient stock available");
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
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
  };

  const restoreCart = (
    items: CartItem[],
    restoredDiscount?: number,
    restoredDiscountType?: "fixed" | "percentage",
  ) => {
    setCart(items);
    // A held transaction never persisted a redemption (only its resulting
    // discount amount), so any redemption tag from before this restore is
    // now stale and must not carry over.
    setRedeemedOption(null);
    if (restoredDiscount !== undefined) setStoreDiscount(restoredDiscount);
    if (restoredDiscountType !== undefined) setStoreDiscountType(restoredDiscountType);
  };

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
  };
}
