import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

/**
 * Carts are partitioned per storefront slug. A single global `items` array
 * (the pre-2026-09 shape) meant items added at /store/pharmacy-a were still
 * in the cart at /store/pharmacy-b and were submitted to *that* store's
 * /storefront/<slug>/checkout with foreign product_ids. Every action is
 * therefore scoped by `storeSlug`; prefer the `useCart(storeSlug)` hook
 * below over touching `carts` directly.
 */
interface CartStore {
  carts: Record<string, CartItem[]>;
  addItem: (storeSlug: string, item: CartItem) => void;
  removeItem: (storeSlug: string, id: string) => void;
  updateQuantity: (storeSlug: string, id: string, quantity: number) => void;
  clearCart: (storeSlug: string) => void;
  /**
   * Reconcile locally cached prices against the live catalog. `prices` maps
   * product_id -> current selling price; any cart item missing from the map
   * is no longer purchasable at this store and is dropped.
   */
  reconcilePrices: (storeSlug: string, prices: Record<string, number>) => void;
}

// Stable identity so `useCart` on an untouched store doesn't hand back a new
// array (and re-render) on every store update.
const EMPTY_ITEMS: CartItem[] = [];

export const useCartStore = create<CartStore>()(
  persist(
    (set) => ({
      carts: {},
      addItem: (storeSlug, item) => set((state) => {
        const items = state.carts[storeSlug] ?? [];
        const existingItem = items.find((i) => i.id === item.id);
        const nextItems = existingItem
          ? items.map((i) =>
              i.id === item.id ? { ...i, quantity: i.quantity + item.quantity } : i
            )
          : [...items, item];
        return { carts: { ...state.carts, [storeSlug]: nextItems } };
      }),
      removeItem: (storeSlug, id) => set((state) => ({
        carts: {
          ...state.carts,
          [storeSlug]: (state.carts[storeSlug] ?? []).filter((i) => i.id !== id),
        },
      })),
      updateQuantity: (storeSlug, id, quantity) => set((state) => ({
        carts: {
          ...state.carts,
          [storeSlug]: (state.carts[storeSlug] ?? []).map((i) =>
            i.id === id ? { ...i, quantity } : i
          ),
        },
      })),
      clearCart: (storeSlug) => set((state) => ({
        carts: { ...state.carts, [storeSlug]: [] },
      })),
      reconcilePrices: (storeSlug, prices) => set((state) => ({
        carts: {
          ...state.carts,
          [storeSlug]: (state.carts[storeSlug] ?? [])
            .filter((i) => prices[i.id] !== undefined)
            .map((i) => (i.price === prices[i.id] ? i : { ...i, price: prices[i.id] })),
        },
      })),
    }),
    {
      name: 'dumosrx-cart',
      version: 2,
      // v1 persisted a flat, store-less `items` array. There is no way to
      // tell which storefront those items came from, so they're dropped
      // rather than being silently attributed to whichever store the
      // customer happens to open next - which is the bug being fixed.
      migrate: () => ({ carts: {} }) as CartStore,
    }
  )
);

export interface ScopedCart {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  reconcilePrices: (prices: Record<string, number>) => void;
  getTotal: () => number;
  getItemCount: () => number;
}

/** Scoped view of the cart for a single storefront. */
export function useCart(storeSlug: string): ScopedCart {
  const store = useCartStore();
  const items = store.carts[storeSlug] ?? EMPTY_ITEMS;

  return {
    items,
    addItem: (item) => store.addItem(storeSlug, item),
    removeItem: (id) => store.removeItem(storeSlug, id),
    updateQuantity: (id, quantity) => store.updateQuantity(storeSlug, id, quantity),
    clearCart: () => store.clearCart(storeSlug),
    reconcilePrices: (prices) => store.reconcilePrices(storeSlug, prices),
    getTotal: () => items.reduce((total, item) => total + item.price * item.quantity, 0),
    getItemCount: () => items.reduce((count, item) => count + item.quantity, 0),
  };
}
