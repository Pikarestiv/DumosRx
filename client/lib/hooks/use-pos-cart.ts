"use client";

import { useState, useMemo, useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";
import { useStore } from "@/lib/context/store-context";

export interface Product {
  id: string;
  name: string;
  generic_name: string;
  brand: string;
  strength: string;
  unit_price: number;
  stock: number;
  cost_price?: number;
  barcode?: string;
  batch_number?: string;
  category_id?: string;
}

export interface CartItem extends Product {
  quantity: number;
  subtotal: number;
}

interface POSCartState {
  cart: CartItem[];
  discount: number;
  setCart: (cart: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
  setDiscount: (discount: number) => void;
}

export const usePOSCartStore = create<POSCartState>()(
  persist(
    (set) => ({
      cart: [],
      discount: 0,
      setCart: (updater) =>
        set((state) => ({
          cart: typeof updater === "function" ? updater(state.cart) : updater,
        })),
      setDiscount: (discount) => set({ discount }),
    }),
    {
      name: "pos-cart-storage",
    }
  )
);

export function usePOSCart(products: Product[]) {
  const { vatPercentage } = useStore();
  const cart = usePOSCartStore((state) => state.cart);
  const setCart = usePOSCartStore((state) => state.setCart);
  const discount = usePOSCartStore((state) => state.discount);
  const setDiscount = usePOSCartStore((state) => state.setDiscount);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.subtotal, 0),
    [cart],
  );

  const tax = useMemo(() => subtotal * (vatPercentage / 100), [subtotal, vatPercentage]);
  const total = useMemo(() => subtotal + tax - discount, [subtotal, tax, discount]);

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

  const restoreCart = (items: CartItem[]) => {
    setCart(items);
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
    setDiscount,
  };
}
