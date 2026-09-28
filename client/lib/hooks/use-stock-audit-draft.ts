"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuditItem } from "@/components/stock-batch/stock-audits";

interface StockAuditDraftState {
  items: AuditItem[];
  setItems: (items: AuditItem[] | ((prev: AuditItem[]) => AuditItem[])) => void;
  clearDraft: () => void;
}

/** An in-progress cycle count, persisted the same way the POS cart is (see
 * use-pos-cart.ts): a count can span a whole shift across hundreds of rows,
 * and a reload, crash or accidental navigation used to lose all of it. */
export const useStockAuditDraftStore = create<StockAuditDraftState>()(
  persist(
    (set) => ({
      items: [],
      setItems: (updater) =>
        set((state) => ({
          items: typeof updater === "function" ? updater(state.items) : updater,
        })),
      clearDraft: () => set({ items: [] }),
    }),
    { name: "stock-audit-draft" },
  ),
);

export function clearStockAuditDraft() {
  useStockAuditDraftStore.getState().clearDraft();
}
