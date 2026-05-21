"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/context/store-context";

export interface Medicine {
  id: string;
  name: string;
  generic_name: string;
  brand: string;
  strength: string;
  unit_price: number;
  stock: number;
  barcode?: string;
}

export interface CartItem extends Medicine {
  quantity: number;
  subtotal: number;
}

export function usePOSCart(medicines: Medicine[]) {
  const { vatPercentage } = useStore();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.subtotal, 0),
    [cart],
  );

  const tax = useMemo(() => subtotal * (vatPercentage / 100), [subtotal, vatPercentage]);
  const total = useMemo(() => subtotal + tax - discount, [subtotal, tax, discount]);

  const addToCart = (medicine: Medicine) => {
    const existingItem = cart.find((item) => item.id === medicine.id);

    if (existingItem) {
      if (existingItem.quantity < medicine.stock) {
        updateQuantity(medicine.id, existingItem.quantity + 1);
      } else {
        toast.warning("Insufficient stock available");
      }
    } else {
      if (medicine.stock > 0) {
        const cartItem: CartItem = {
          ...medicine,
          quantity: 1,
          subtotal: medicine.unit_price,
        };
        setCart((prev) => [...prev, cartItem]);
        toast.success(`${medicine.name} added to cart`);
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

    const medicine = medicines.find((m) => m.id === id);
    if (medicine && newQuantity > medicine.stock) {
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
    cart,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    restoreCart,
    subtotal,
    tax,
    total,
    discount,
    setDiscount,
  };
}
