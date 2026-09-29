"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AdjustmentDraftItem } from "@/components/stock-batch/adjustment-items-step";
import type { AdjustmentReasonValue } from "@/components/stock-batch/adjustment-derivations";

interface StockAdjustmentDraftState {
  reason: AdjustmentReasonValue;
  note: string;
  items: AdjustmentDraftItem[];
  setReason: (reason: AdjustmentReasonValue) => void;
  setNote: (note: string) => void;
  addItem: (item: AdjustmentDraftItem) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clearDraft: () => void;
}

const EMPTY_DRAFT = {
  reason: "damage" as AdjustmentReasonValue,
  note: "",
  items: [] as AdjustmentDraftItem[],
};

/** Persisted for the same reason the cycle-count draft is (see
 * use-stock-audit-draft.ts): a half-entered adjustment must survive a
 * reload or an accidental navigation. */
export const useStockAdjustmentDraftStore = create<StockAdjustmentDraftState>()(
  persist(
    (set) => ({
      ...EMPTY_DRAFT,
      setReason: (reason) => set({ reason }),
      setNote: (note) => set({ note }),
      addItem: (item) =>
        set((state) =>
          state.items.some((existing) => existing.productId === item.productId)
            ? state
            : { items: [...state.items, item] },
        ),
      setQuantity: (productId, quantity) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.productId === productId ? { ...item, quantity } : item,
          ),
        })),
      removeItem: (productId) =>
        set((state) => ({
          items: state.items.filter((item) => item.productId !== productId),
        })),
      clearDraft: () => set({ ...EMPTY_DRAFT }),
    }),
    { name: "stock-adjustment-draft" },
  ),
);
