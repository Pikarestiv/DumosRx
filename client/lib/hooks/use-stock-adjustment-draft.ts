"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AdjustmentDraftItem } from "@/components/stock-batch/adjustment-items-step";
import type { AdjustmentReasonValue } from "@/components/stock-batch/adjustment-derivations";
import { getActiveStoreId } from "@/lib/db/core";
import {
  deleteLocalStockAdjustmentDraft,
  clearAllLocalStockAdjustmentDrafts,
  getLocalStockAdjustmentDraft,
  saveLocalStockAdjustmentDraft,
  type StockAdjustmentDraftData,
} from "@/lib/db/queries/stock-adjustment-drafts";

export type { StockAdjustmentDraftData };

interface StockAdjustmentDraftState {
  drafts: Record<string, StockAdjustmentDraftData>;
  reason: AdjustmentReasonValue;
  note: string;
  items: AdjustmentDraftItem[];
  activeStoreId: string | null;
  setActiveStoreId: (storeId: string | null) => void;
  loadStoreDraft: (storeId: string) => Promise<void>;
  setReason: (reason: AdjustmentReasonValue) => void;
  setNote: (note: string) => void;
  addItem: (item: AdjustmentDraftItem) => void;
  setQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clearDraft: (targetStoreId?: string) => void;
  clearAllDrafts: () => void;
  hasActiveDraft: (storeId?: string | null) => boolean;
}

const EMPTY_DRAFT: StockAdjustmentDraftData = {
  reason: "damage",
  note: "",
  items: [],
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(storeId: string, draft: StockAdjustmentDraftData) {
  if (!storeId) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveLocalStockAdjustmentDraft(storeId, draft).catch(() => {});
  }, 400);
}

export function migrateStockAdjustmentDraft(
  persisted: unknown,
  version: number,
): {
  reason: AdjustmentReasonValue;
  note: string;
  items: AdjustmentDraftItem[];
  drafts?: Record<string, StockAdjustmentDraftData>;
} {
  const state = (persisted ?? {}) as {
    reason?: AdjustmentReasonValue;
    note?: string;
    items?: AdjustmentDraftItem[];
    drafts?: Record<string, StockAdjustmentDraftData>;
  };
  const reason = state.reason ?? "damage";
  const note = state.note ?? "";
  const items = state.items ?? [];
  if (state.drafts !== undefined) {
    return { reason, note, items, drafts: state.drafts };
  }
  return { reason, note, items };
}

export const useStockAdjustmentDraftStore = create<StockAdjustmentDraftState>()(
  persist(
    (set, get) => ({
      drafts: {},
      ...EMPTY_DRAFT,
      activeStoreId: null,

      setActiveStoreId: (newStoreId) => {
        set((state) => {
          if (state.activeStoreId === newStoreId) return state;

          const isInitialMount = state.activeStoreId === null;
          const currentDraftData: StockAdjustmentDraftData = {
            reason: state.reason,
            note: state.note,
            items: state.items,
          };
          const hasLegacyItems =
            isInitialMount &&
            state.items.length > 0 &&
            Object.keys(state.drafts).length === 0;

          const updatedDrafts = state.activeStoreId
            ? { ...state.drafts, [state.activeStoreId]: currentDraftData }
            : hasLegacyItems && newStoreId
              ? { ...state.drafts, [newStoreId]: currentDraftData }
              : state.drafts;

          const nextDraft = newStoreId
            ? (updatedDrafts[newStoreId] ?? (hasLegacyItems ? currentDraftData : EMPTY_DRAFT))
            : EMPTY_DRAFT;

          if (newStoreId && hasLegacyItems && state.items.length > 0) {
            scheduleSave(newStoreId, currentDraftData);
          }

          return {
            activeStoreId: newStoreId,
            drafts: updatedDrafts,
            reason: nextDraft.reason,
            note: nextDraft.note,
            items: nextDraft.items,
          };
        });

        if (newStoreId) {
          void get().loadStoreDraft(newStoreId);
        }
      },

      loadStoreDraft: async (storeId: string) => {
        if (!storeId) return;
        const sqliteDraft = await getLocalStockAdjustmentDraft(storeId);
        if (sqliteDraft && (sqliteDraft.items.length > 0 || sqliteDraft.note)) {
          set((state) => {
            if (state.activeStoreId !== storeId && state.activeStoreId !== null) {
              return {
                drafts: { ...state.drafts, [storeId]: sqliteDraft },
              };
            }
            return {
              reason: sqliteDraft.reason,
              note: sqliteDraft.note,
              items: sqliteDraft.items,
              drafts: { ...state.drafts, [storeId]: sqliteDraft },
            };
          });
        }
      },

      setReason: (reason) =>
        set((state) => {
          const storeKey =
            state.activeStoreId || getActiveStoreId() || "default";
          const updatedDraft: StockAdjustmentDraftData = {
            reason,
            note: state.note,
            items: state.items,
          };
          scheduleSave(storeKey, updatedDraft);
          return {
            reason,
            drafts: { ...state.drafts, [storeKey]: updatedDraft },
          };
        }),

      setNote: (note) =>
        set((state) => {
          const storeKey =
            state.activeStoreId || getActiveStoreId() || "default";
          const updatedDraft: StockAdjustmentDraftData = {
            reason: state.reason,
            note,
            items: state.items,
          };
          scheduleSave(storeKey, updatedDraft);
          return {
            note,
            drafts: { ...state.drafts, [storeKey]: updatedDraft },
          };
        }),

      addItem: (item) =>
        set((state) => {
          if (state.items.some((existing) => existing.productId === item.productId)) {
            return state;
          }
          const nextItems = [...state.items, item];
          const storeKey =
            state.activeStoreId || getActiveStoreId() || "default";
          const updatedDraft: StockAdjustmentDraftData = {
            reason: state.reason,
            note: state.note,
            items: nextItems,
          };
          scheduleSave(storeKey, updatedDraft);
          return {
            items: nextItems,
            drafts: { ...state.drafts, [storeKey]: updatedDraft },
          };
        }),

      setQuantity: (productId, quantity) =>
        set((state) => {
          const nextItems = state.items.map((item) =>
            item.productId === productId ? { ...item, quantity } : item,
          );
          const storeKey =
            state.activeStoreId || getActiveStoreId() || "default";
          const updatedDraft: StockAdjustmentDraftData = {
            reason: state.reason,
            note: state.note,
            items: nextItems,
          };
          scheduleSave(storeKey, updatedDraft);
          return {
            items: nextItems,
            drafts: { ...state.drafts, [storeKey]: updatedDraft },
          };
        }),

      removeItem: (productId) =>
        set((state) => {
          const nextItems = state.items.filter((item) => item.productId !== productId);
          const storeKey =
            state.activeStoreId || getActiveStoreId() || "default";
          const updatedDraft: StockAdjustmentDraftData = {
            reason: state.reason,
            note: state.note,
            items: nextItems,
          };
          scheduleSave(storeKey, updatedDraft);
          return {
            items: nextItems,
            drafts: { ...state.drafts, [storeKey]: updatedDraft },
          };
        }),

      clearDraft: (targetStoreId) => {
        set((state) => {
          const storeKey =
            targetStoreId || state.activeStoreId || getActiveStoreId() || "default";
          deleteLocalStockAdjustmentDraft(storeKey).catch(() => {});
          const nextDrafts = { ...state.drafts };
          delete nextDrafts[storeKey];
          const isTargetActive =
            state.activeStoreId === storeKey || !targetStoreId;
          return {
            drafts: nextDrafts,
            reason: isTargetActive ? EMPTY_DRAFT.reason : state.reason,
            note: isTargetActive ? EMPTY_DRAFT.note : state.note,
            items: isTargetActive ? [] : state.items,
          };
        });
      },

      clearAllDrafts: () => {
        clearAllLocalStockAdjustmentDrafts().catch(() => {});
        set({ drafts: {}, ...EMPTY_DRAFT });
      },

      hasActiveDraft: (storeId) => {
        const state = get();
        const storeKey =
          storeId || state.activeStoreId || getActiveStoreId() || "default";
        const targetDraft =
          state.drafts[storeKey] ??
          (storeKey === state.activeStoreId
            ? { reason: state.reason, note: state.note, items: state.items }
            : null);
        return Boolean(
          targetDraft &&
            (targetDraft.items.length > 0 || targetDraft.note.trim().length > 0),
        );
      },
    }),
    {
      name: "stock-adjustment-draft",
      version: 2,
      migrate: (persisted, version) =>
        migrateStockAdjustmentDraft(persisted, version) as StockAdjustmentDraftState,
    },
  ),
);

export function clearStockAdjustmentDraft(storeId?: string) {
  useStockAdjustmentDraftStore.getState().clearDraft(storeId);
}

export function hasActiveStockAdjustmentDraft(storeId?: string | null): boolean {
  return useStockAdjustmentDraftStore.getState().hasActiveDraft(storeId);
}
