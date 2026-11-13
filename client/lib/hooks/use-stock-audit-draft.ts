"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import type { AuditItem } from "@/components/stock-batch/stock-audits";
import { getActiveStoreId, initDatabase } from "@/lib/db/core";
import {
  deleteLocalStockAuditDraft,
  clearAllLocalStockAuditDrafts,
  getLocalStockAuditDraft,
  hasAnyLocalStockAuditCount,
  saveLocalStockAuditDraft,
} from "@/lib/db/queries/stock-audit-drafts";
import {
  adoptUnscopedStockAuditDraft,
  importLegacyStockAuditDrafts,
} from "./stock-audit-draft-legacy";

export { migrateStockAuditDraft } from "./stock-audit-draft-legacy";

interface StockAuditDraftState {
  drafts: Record<string, AuditItem[]>;
  items: AuditItem[];
  activeStoreId: string | null;
  loadedStoreId: string | null;
  setActiveStoreId: (storeId: string | null) => void;
  loadStoreDraft: (storeId: string) => Promise<void>;
  setItems: (updater: AuditItem[] | ((prev: AuditItem[]) => AuditItem[])) => void;
  clearDraft: (targetStoreId?: string) => void;
  clearAllDrafts: () => void;
  hasActiveCount: (storeId?: string | null) => boolean;
}

const SAVE_DEBOUNCE_MS = 400;
const pendingSaves = new Map<string, { timer: ReturnType<typeof setTimeout>; items: AuditItem[] }>();

function scheduleSave(storeId: string, items: AuditItem[]) {
  cancelSave(storeId);
  const timer = setTimeout(() => {
    pendingSaves.delete(storeId);
    void saveLocalStockAuditDraft(storeId, items);
  }, SAVE_DEBOUNCE_MS);
  pendingSaves.set(storeId, { timer, items });
}

function cancelSave(storeId: string) {
  const pending = pendingSaves.get(storeId);
  if (pending) clearTimeout(pending.timer);
  pendingSaves.delete(storeId);
}

export async function flushStockAuditDraftSaves(): Promise<void> {
  const writes = [...pendingSaves].map(([storeId, { timer, items }]) => {
    clearTimeout(timer);
    pendingSaves.delete(storeId);
    return saveLocalStockAuditDraft(storeId, items);
  });
  await Promise.all(writes);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => void flushStockAuditDraftSaves());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushStockAuditDraftSaves();
  });
}

function storeKeyFor(state: StockAuditDraftState, storeId?: string | null): string | null {
  return storeId || state.activeStoreId || getActiveStoreId() || null;
}

function hasCountedRow(items: AuditItem[]): boolean {
  return items.some(
    (item) =>
      item.counted === true ||
      (item.countedQty !== undefined && item.countedQty !== null),
  );
}

export const useStockAuditDraftStore = create<StockAuditDraftState>()((set, get) => ({
  drafts: {},
  items: [],
  activeStoreId: null,
  loadedStoreId: null,

  setActiveStoreId: (newStoreId) => {
    const state = get();
    if (state.activeStoreId === newStoreId) {
      if (newStoreId && state.loadedStoreId !== newStoreId) void get().loadStoreDraft(newStoreId);
      return;
    }

    const outgoing = state.activeStoreId;
    const unscopedItems = outgoing === null ? state.items : [];
    const drafts = outgoing ? { ...state.drafts, [outgoing]: state.items } : { ...state.drafts };
    if (newStoreId && unscopedItems.length > 0 && !drafts[newStoreId]?.length) {
      drafts[newStoreId] = unscopedItems;
      scheduleSave(newStoreId, unscopedItems);
    }

    set({
      activeStoreId: newStoreId,
      drafts,
      items: newStoreId ? (drafts[newStoreId] ?? []) : [],
      loadedStoreId: null,
    });
    if (outgoing) void flushStockAuditDraftSaves();
    if (newStoreId) void get().loadStoreDraft(newStoreId);
  },

  loadStoreDraft: async (storeId) => {
    if (!storeId) return;
    await initDatabase().catch(() => null);
    await importLegacyStockAuditDrafts(storeId);
    const stored =
      (await getLocalStockAuditDraft(storeId)) ?? (await adoptUnscopedStockAuditDraft(storeId));

    set((state) => {
      const inMemory = state.drafts[storeId] ?? [];
      const restored = inMemory.length > 0 || !stored?.length ? inMemory : stored;
      const isActive = state.activeStoreId === storeId;
      return {
        drafts: { ...state.drafts, [storeId]: restored },
        ...(isActive ? { items: restored, loadedStoreId: storeId } : {}),
      };
    });
  },

  setItems: (updater) => {
    set((state) => {
      const nextItems = typeof updater === "function" ? updater(state.items) : updater;
      const storeKey = storeKeyFor(state);
      if (!storeKey) return { items: nextItems };
      scheduleSave(storeKey, nextItems);
      return { items: nextItems, drafts: { ...state.drafts, [storeKey]: nextItems } };
    });
  },

  clearDraft: (targetStoreId) => {
    const storeKey = storeKeyFor(get(), targetStoreId);
    if (storeKey) {
      cancelSave(storeKey);
      void deleteLocalStockAuditDraft(storeKey);
    }
    set((state) => {
      const nextDrafts = { ...state.drafts };
      if (storeKey) delete nextDrafts[storeKey];
      const clearsActive = !targetStoreId || state.activeStoreId === storeKey;
      return { drafts: nextDrafts, items: clearsActive ? [] : state.items };
    });
  },

  clearAllDrafts: () => {
    pendingSaves.forEach(({ timer }) => clearTimeout(timer));
    pendingSaves.clear();
    void clearAllLocalStockAuditDrafts();
    set({ drafts: {}, items: [] });
  },

  hasActiveCount: (storeId) => {
    const state = get();
    const storeKey = storeKeyFor(state, storeId);
    const items =
      (storeKey ? state.drafts[storeKey] : undefined) ??
      (storeKey === state.activeStoreId ? state.items : []);
    return hasCountedRow(items);
  },
}));

export function clearStockAuditDraft(storeId?: string) {
  useStockAuditDraftStore.getState().clearDraft(storeId);
}

export function clearAllStockAuditDrafts() {
  useStockAuditDraftStore.getState().clearAllDrafts();
}

export function hasActiveStockAuditCount(storeId?: string | null): boolean {
  return useStockAuditDraftStore.getState().hasActiveCount(storeId);
}

export const UNFINISHED_COUNT_WIPE_NOTE =
  "An unfinished cycle count saved on this device will be deleted too. Rows already saved to the store's cloud count session stay there and can be taken over from Cycle Count.";

export function useUnfinishedStockCountOnDevice(enabled: boolean): boolean {
  const [exists, setExists] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void hasAnyLocalStockAuditCount().then((found) => {
      if (!cancelled) setExists(found || hasActiveStockAuditCount());
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return enabled && exists;
}
