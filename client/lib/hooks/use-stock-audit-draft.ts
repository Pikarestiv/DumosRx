"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuditItem } from "@/components/stock-batch/stock-audits";

interface StockAuditDraftState {
  items: AuditItem[];
  setItems: (items: AuditItem[] | ((prev: AuditItem[]) => AuditItem[])) => void;
  clearDraft: () => void;
}

// Drafts written before 2026-10-13 pre-filled every row's countedQty with the system quantity, and "has a quantity" is now what marks a row co…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-stock-audit-draft-L13
export function migrateStockAuditDraft(
  persisted: unknown,
  version: number,
): { items: AuditItem[] } {
  const state = (persisted ?? {}) as { items?: AuditItem[] };
  const items = state.items ?? [];
  if (version >= 1) return { items };
  return {
    items: items.map((item) =>
      item.counted !== true && item.countedQty === item.systemQty
        ? { ...item, countedQty: undefined }
        : item,
    ),
  };
}

// An in-progress cycle count, persisted the same way the POS cart is (see use-pos-cart.ts):
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-stock-audit-draft-ts-L31
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
    {
      name: "stock-audit-draft",
      version: 1,
      migrate: (persisted, version) =>
        migrateStockAuditDraft(persisted, version) as StockAuditDraftState,
    },
  ),
);

export function clearStockAuditDraft() {
  useStockAuditDraftStore.getState().clearDraft();
}
