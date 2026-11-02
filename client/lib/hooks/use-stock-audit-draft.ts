"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuditItem } from "@/components/stock-batch/stock-audits";
import { getActiveStoreId } from "@/lib/db/core";
import {
  deleteLocalStockAuditDraft,
  clearAllLocalStockAuditDrafts,
  getLocalStockAuditDraft,
  saveLocalStockAuditDraft,
} from "@/lib/db/queries/stock-audit-drafts";

interface StockAuditDraftState {
  drafts: Record<string, AuditItem[]>;
  items: AuditItem[];
  activeStoreId: string | null;
  setActiveStoreId: (storeId: string | null) => void;
  loadStoreDraft: (storeId: string) => Promise<void>;
  setItems: (updater: AuditItem[] | ((prev: AuditItem[]) => AuditItem[])) => void;
  clearDraft: (targetStoreId?: string) => void;
  clearAllDrafts: () => void;
  hasActiveCount: (storeId?: string | null) => boolean;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(storeId: string, items: AuditItem[]) {
  if (!storeId) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveLocalStockAuditDraft(storeId, items).catch(() => {});
  }, 400);
}

export function migrateStockAuditDraft(
  persisted: unknown,
  version: number,
): { items: AuditItem[]; drafts?: Record<string, AuditItem[]> } {
  const state = (persisted ?? {}) as {
    items?: AuditItem[];
    drafts?: Record<string, AuditItem[]>;
  };
  const items = state.items ?? [];
  const cleanItems =
    version >= 1
      ? items
      : items.map((item) =>
          item.counted !== true && item.countedQty === item.systemQty
            ? { ...item, countedQty: undefined }
            : item,
        );
  if (state.drafts !== undefined) {
    return { items: cleanItems, drafts: state.drafts };
  }
  return { items: cleanItems };
}

export const useStockAuditDraftStore = create<StockAuditDraftState>()(
  persist(
    (set, get) => ({
      drafts: {},
      items: [],
      activeStoreId: null,

      setActiveStoreId: (newStoreId) => {
        set((state) => {
          if (state.activeStoreId === newStoreId) return state;

          const isInitialMount = state.activeStoreId === null;
          const hasLegacyItems =
            isInitialMount &&
            state.items.length > 0 &&
            Object.keys(state.drafts).length === 0;

          const updatedDrafts = state.activeStoreId
            ? { ...state.drafts, [state.activeStoreId]: state.items }
            : hasLegacyItems && newStoreId
              ? { ...state.drafts, [newStoreId]: state.items }
              : state.drafts;

          const nextItems = newStoreId
            ? (updatedDrafts[newStoreId] ?? (hasLegacyItems ? state.items : []))
            : [];

          if (newStoreId && hasLegacyItems && state.items.length > 0) {
            scheduleSave(newStoreId, state.items);
          }

          return {
            activeStoreId: newStoreId,
            drafts: updatedDrafts,
            items: nextItems,
          };
        });

        if (newStoreId) {
          void get().loadStoreDraft(newStoreId);
        }
      },

      loadStoreDraft: async (storeId: string) => {
        if (!storeId) return;
        const sqliteItems = await getLocalStockAuditDraft(storeId);
        if (sqliteItems && sqliteItems.length > 0) {
          set((state) => {
            if (state.activeStoreId !== storeId && state.activeStoreId !== null) {
              return {
                drafts: { ...state.drafts, [storeId]: sqliteItems },
              };
            }
            return {
              items: sqliteItems,
              drafts: { ...state.drafts, [storeId]: sqliteItems },
            };
          });
        }
      },

      setItems: (updater) => {
        set((state) => {
          const nextItems =
            typeof updater === "function" ? updater(state.items) : updater;
          const storeKey =
            state.activeStoreId || getActiveStoreId() || "default";
          scheduleSave(storeKey, nextItems);
          return {
            items: nextItems,
            drafts: {
              ...state.drafts,
              [storeKey]: nextItems,
            },
          };
        });
      },

      clearDraft: (targetStoreId) => {
        set((state) => {
          const storeKey =
            targetStoreId || state.activeStoreId || getActiveStoreId() || "default";
          deleteLocalStockAuditDraft(storeKey).catch(() => {});
          const nextDrafts = { ...state.drafts };
          delete nextDrafts[storeKey];
          return {
            drafts: nextDrafts,
            items:
              state.activeStoreId === storeKey || !targetStoreId
                ? []
                : state.items,
          };
        });
      },

      clearAllDrafts: () => {
        clearAllLocalStockAuditDrafts().catch(() => {});
        set({ drafts: {}, items: [] });
      },

      hasActiveCount: (storeId) => {
        const state = get();
        const storeKey =
          storeId || state.activeStoreId || getActiveStoreId() || "default";
        const targetItems =
          state.drafts[storeKey] ??
          (storeKey === state.activeStoreId ? state.items : []);
        return targetItems.some(
          (item) =>
            item.counted === true ||
            (item.countedQty !== undefined && item.countedQty !== null),
        );
      },
    }),
    {
      name: "stock-audit-draft",
      version: 2,
      migrate: (persisted, version) =>
        migrateStockAuditDraft(persisted, version) as StockAuditDraftState,
    },
  ),
);

export function clearStockAuditDraft(storeId?: string) {
  useStockAuditDraftStore.getState().clearDraft(storeId);
}

export function hasActiveStockAuditCount(storeId?: string | null): boolean {
  return useStockAuditDraftStore.getState().hasActiveCount(storeId);
}
