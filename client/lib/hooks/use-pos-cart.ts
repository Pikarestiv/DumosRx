"use client";

import { useMemo, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/context/store-context";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { useDisplayName } from "@/lib/hooks/use-uppercase-display";
import { useStockVisibility } from "@/lib/hooks/use-stock-visibility";
import { formatBackorderWarning, formatInsufficientStock } from "@/lib/utils/stock-status";
import {
  calculateSubtotal,
  calculateTax,
  calculateDiscountAmount,
  calculateTotal,
  roundMoney,
} from "@/lib/utils/pos-calculations";
import type { POSProduct as Product } from "@/lib/types/product";
export type { POSProduct as Product } from "@/lib/types/product";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import {
  usePOSCartStore,
  clearPOSCartContents,
  restorePOSCart,
  repriceCartFromCatalog,
  buildNewCartItem,
  buildNewServiceCartItem,
  applySpotSourcingConfig,
  updateCartSpotSourcing,
  type CartItem,
  type MarkupType,
  type AddToCartOptions,
  type SpotSourcingConfig,
  type SpotSourcingSplitOptions,
} from "./use-pos-cart-store";
import type { Service } from "@/lib/types/service";
export {
  clearPOSCartStorage,
  repriceCartFromCatalog,
  type CartItem,
  type CartRepricing,
  type MarkupType,
  type RedeemedOption,
  type AddToCartOptions,
  type SpotSourcingConfig,
  type SpotSourcingSplitOptions,
} from "./use-pos-cart-store";

export function usePOSCart(products: Product[]) {
  const { vatPercentage } = useStore();
  const { canUseLoyaltyProgram, canSellWithoutStock } = useFeatureGate();
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
  const isHydrated = useHydrated();

  const setDiscount = useCallback((value: number) => {
    setStoreDiscount(value);
    setRedeemedOption(null);
  }, [setStoreDiscount, setRedeemedOption]);

  const setDiscountType = useCallback((type: "fixed" | "percentage") => {
    setStoreDiscountType(type);
    setRedeemedOption(null);
  }, [setStoreDiscountType, setRedeemedOption]);

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

  useEffect(() => {
    if (!canUseLoyaltyProgram && redeemedOption) clearRedemption();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseLoyaltyProgram, redeemedOption]);

  const subtotal = useMemo(() => calculateSubtotal(cart), [cart]);
  const calculatedDiscount = useMemo(() => calculateDiscountAmount(subtotal, discount, discountType), [subtotal, discount, discountType]);
  const tax = useMemo(() => calculateTax(Math.max(0, subtotal - calculatedDiscount), vatPercentage), [subtotal, calculatedDiscount, vatPercentage]);
  const total = useMemo(() => calculateTotal(subtotal, tax, calculatedDiscount), [subtotal, tax, calculatedDiscount]);

  const displayName = useDisplayName();

  const removeFromCart = useCallback(
    (id: string) => {
      const removed = cart.find((item) => item.id === id);
      setCart((prev) => prev.filter((item) => item.id !== id));
      if (!removed) return;
      toast(`${displayName(removed.name)} removed from cart`, {
        action: {
          label: "Undo",
          onClick: () => setCart((prev) => prev.some((i) => i.id === removed.id) ? prev : [...prev, removed]),
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

      const currentItem = cart.find((item) => item.id === id);
      if (currentItem?.item_type === "service") {
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
        return;
      }

      const product = products.find((m) => m.id === id);
      if (product && newQuantity > product.stock && !currentItem?.is_spot_sourced) {
        if (!canSellWithoutStock) {
          toast.warning(formatInsufficientStock(product.stock, canSeeQuantities));
          return;
        }
        const previous = currentItem?.quantity ?? 0;
        if (previous <= product.stock) {
          toast.warning(formatBackorderWarning(product.stock, newQuantity, canSeeQuantities));
        }
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
    [products, cart, setCart, removeFromCart, canSeeQuantities, canSellWithoutStock],
  );

  const addToCart = useCallback(
    (product: Product, options?: AddToCartOptions) => {
      const existingItem = cart.find((item) => item.id === product.id);

      if (existingItem) {
        if (options?.isSpotSourced) {
          setCart((prev) =>
            prev.map((item) =>
              item.id === product.id
                ? applySpotSourcingConfig(item, {
                    isSpotSourced: true,
                    sourcingCost: options.sourcingCost,
                    paymentSource: options.paymentSource,
                    partner: options.partner,
                    quantity: options.quantity ?? item.quantity + 1,
                    sellingPrice: options.sellingPrice,
                  })
                : item,
            ),
          );
          toast.success(`${displayName(product.name)} added as spot-sourced`);
          return;
        }
        if (canSellWithoutStock || existingItem.is_spot_sourced || existingItem.quantity < product.stock) {
          updateQuantity(product.id, existingItem.quantity + 1);
        } else {
          toast.warning(formatInsufficientStock(product.stock, canSeeQuantities));
        }
        return;
      }

      if (product.stock > 0 || canSellWithoutStock || options?.isSpotSourced) {
        const cartItem = buildNewCartItem(product, options);
        setCart((prev) => [...prev, cartItem]);
        if (options?.isSpotSourced) {
          toast.success(`${displayName(product.name)} added as spot-sourced`);
        } else if (product.stock > 0) {
          toast.success(`${displayName(product.name)} added to cart`);
        } else {
          toast.warning(formatBackorderWarning(product.stock, cartItem.quantity, canSeeQuantities));
        }
      } else {
        toast.error("This item is out of stock");
      }
    },
    [cart, setCart, updateQuantity, displayName, canSeeQuantities, canSellWithoutStock],
  );

  const updateSpotSourcing = useCallback(
    (id: string, config: SpotSourcingConfig | null, splitOptions?: SpotSourcingSplitOptions) => {
      const currentItem = cart.find((item) => item.id === id);
      const baseProductId = currentItem?.product_id || id.replace(/:spot_sourced$/, "");
      const product = products.find((p) => p.id === baseProductId);
      const availableStock = product?.stock ?? currentItem?.stock ?? 0;
      const result = updateCartSpotSourcing(
        cart, id, config, availableStock, canSellWithoutStock, isResellerSale, splitOptions,
      );
      setCart(result.cart);
      if (result.removedName) {
        toast.info(`${displayName(result.removedName)} removed from cart (no shelf stock available)`);
      }
    },
    [products, cart, setCart, canSellWithoutStock, isResellerSale, displayName],
  );

  const addServiceToCart = useCallback(
    (service: Service, quantity = 1) => {
      const existing = cart.find((item) => item.id === service.id && item.item_type === "service");
      if (existing) {
        updateQuantity(service.id, existing.quantity + quantity);
      } else {
        const cartItem = buildNewServiceCartItem(service, quantity);
        setCart((prev) => [...prev, cartItem]);
        toast.success(`${displayName(service.name)} added to cart`);
      }
    },
    [cart, updateQuantity, setCart, displayName],
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
    clearPOSCartContents();
  }, []);

  const restoreCart = useCallback(
    (
      items: CartItem[],
      restoredDiscount?: number,
      restoredDiscountType?: "fixed" | "percentage",
      restoredMarkup?: { isResellerSale: boolean; markupType: MarkupType | null },
    ) => {
      restorePOSCart(items, restoredDiscount, restoredDiscountType, restoredMarkup);
    },
    [],
  );

  return {
    cart: isHydrated ? cart : [],
    addToCart,
    addServiceToCart,
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
    updateSpotSourcing,
    isResellerSale: isHydrated ? isResellerSale : false,
    setIsResellerSale,
    markupType: isHydrated ? markupType : null,
    setMarkupType,
  };
}
