"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import type { AuditItem } from "@/components/stock-batch/stock-audits";
import {
  getActiveStoreId,
  initDatabase,
  onBeforeWriterHandoff,
  onWriterTabChange,
} from "@/lib/db/core";
import {
  deleteLocalStockAuditDraft,
  clearAllLocalStockAuditDrafts,
  getLocalStockAuditDraft,
  hasAnyLocalStockAuditCount,
  saveLocalStockAuditDraft,
} from "@/lib/db/queries/stock-audit-drafts";
import { getLocalStockAuditDraftSessionId } from "@/lib/db/queries/stock-audit-draft-session";
import { hasCountedAuditRow } from "@/components/stock-batch/audit-derivations";
import {
  adoptUnscopedStockAuditDraft,
  discardLegacyStockAuditDraft,
  importLegacyStockAuditDrafts,
} from "./stock-audit-draft-legacy";

export { migrateStockAuditDraft } from "./stock-audit-draft-legacy";

interface StockAuditDraftState {
  drafts: Record<string, AuditItem[]>;
  cloudSessionIds: Record<string, string | null>;
  items: AuditItem[];
  cloudSessionId: string | null;
  activeStoreId: string | null;
  loadedStoreId: string | null;
  setActiveStoreId: (storeId: string | null) => void;
  loadStoreDraft: (storeId: string) => Promise<void>;
  setItems: (updater: AuditItem[] | ((prev: AuditItem[]) => AuditItem[])) => void;
  setCloudSessionId: (sessionId: string | null, targetStoreId?: string) => void;
  clearDraft: (targetStoreId?: string) => void;
  clearAllDrafts: () => void;
  hasActiveCount: (storeId?: string | null) => boolean;
}

const SAVE_DEBOUNCE_MS = 400;
const pendingSaves = new Map<string, { timer: ReturnType<typeof setTimeout>; items: AuditItem[]; cloudSessionId: string | null }>();

function scheduleSave(storeId: string, items: AuditItem[], cloudSessionId: string | null = null) {
  cancelSave(storeId);
  const timer = setTimeout(() => {
    pendingSaves.delete(storeId);
    void saveLocalStockAuditDraft(storeId, items, undefined, cloudSessionId);
  }, SAVE_DEBOUNCE_MS);
  pendingSaves.set(storeId, { timer, items, cloudSessionId });
}

function cancelSave(storeId: string) {
  const pending = pendingSaves.get(storeId);
  if (pending) clearTimeout(pending.timer);
  pendingSaves.delete(storeId);
}

function cancelAllSaves() {
  pendingSaves.forEach(({ timer }) => clearTimeout(timer));
  pendingSaves.clear();
}

export async function flushStockAuditDraftSaves(): Promise<void> {
  const writes = [...pendingSaves].map(([storeId, { timer, items, cloudSessionId }]) => {
    clearTimeout(timer);
    pendingSaves.delete(storeId);
    return saveLocalStockAuditDraft(storeId, items, undefined, cloudSessionId);
  });
  await Promise.all(writes);
}

if (typeof window !== "undefined") {
  onBeforeWriterHandoff(flushStockAuditDraftSaves);
  window.addEventListener("pagehide", () => void flushStockAuditDraftSaves());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushStockAuditDraftSaves();
  });
}

function storeKeyFor(state: StockAuditDraftState, storeId?: string | null): string | null {
  return storeId || state.activeStoreId || getActiveStoreId() || null;
}

export const useStockAuditDraftStore = create<StockAuditDraftState>()((set, get) => ({
  drafts: {},
  cloudSessionIds: {},
  items: [],
  cloudSessionId: null,
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
    const cloudSessionIds = outgoing
      ? { ...state.cloudSessionIds, [outgoing]: state.cloudSessionId }
      : { ...state.cloudSessionIds };
    if (newStoreId && hasCountedAuditRow(unscopedItems) && !hasCountedAuditRow(drafts[newStoreId] ?? [])) {
      drafts[newStoreId] = unscopedItems;
      scheduleSave(newStoreId, unscopedItems, cloudSessionIds[newStoreId] ?? null);
    }

    set({
      activeStoreId: newStoreId,
      drafts,
      cloudSessionIds,
      items: newStoreId ? (drafts[newStoreId] ?? []) : [],
      cloudSessionId: newStoreId ? (cloudSessionIds[newStoreId] ?? null) : null,
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
    const storedSessionId = await getLocalStockAuditDraftSessionId(storeId);

    set((state) => {
      const inMemory = state.drafts[storeId] ?? [];
      const restored = hasCountedAuditRow(inMemory) || !stored?.length ? inMemory : stored;
      const restoredSessionId =
        state.cloudSessionIds[storeId] ?? storedSessionId;
      if (restored === stored) cancelSave(storeId);
      const isActive = state.activeStoreId === storeId;
      return {
        drafts: { ...state.drafts, [storeId]: restored },
        cloudSessionIds: { ...state.cloudSessionIds, [storeId]: restoredSessionId },
        ...(isActive ? { items: restored, cloudSessionId: restoredSessionId, loadedStoreId: storeId } : {}),
      };
    });
  },

  setItems: (updater) => {
    set((state) => {
      const nextItems = typeof updater === "function" ? updater(state.items) : updater;
      const storeKey = storeKeyFor(state);
      if (!storeKey) return { items: nextItems };
      const sessionId = state.cloudSessionIds[storeKey] ?? state.cloudSessionId ?? null;
      scheduleSave(storeKey, nextItems, sessionId);
      return { items: nextItems, drafts: { ...state.drafts, [storeKey]: nextItems } };
    });
  },

  setCloudSessionId: (sessionId, targetStoreId) => {
    set((state) => {
      const storeKey = storeKeyFor(state, targetStoreId);
      if (!storeKey) return { cloudSessionId: sessionId };
      const currentItems =
        storeKey === state.activeStoreId ? state.items : (state.drafts[storeKey] ?? []);
      if (currentItems.length > 0) {
        scheduleSave(storeKey, currentItems, sessionId);
      }
      const updatesActive = !targetStoreId || state.activeStoreId === storeKey;
      return {
        cloudSessionIds: { ...state.cloudSessionIds, [storeKey]: sessionId },
        ...(updatesActive ? { cloudSessionId: sessionId } : {}),
      };
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
      const nextSessionIds = { ...state.cloudSessionIds };
      if (storeKey) {
        delete nextDrafts[storeKey];
        delete nextSessionIds[storeKey];
      }
      const clearsActive = !targetStoreId || state.activeStoreId === storeKey;
      return {
        drafts: nextDrafts,
        cloudSessionIds: nextSessionIds,
        items: clearsActive ? [] : state.items,
        cloudSessionId: clearsActive ? null : state.cloudSessionId,
      };
    });
  },

  clearAllDrafts: () => {
    cancelAllSaves();
    void clearAllLocalStockAuditDrafts();
    discardLegacyStockAuditDraft();
    set({ drafts: {}, cloudSessionIds: {}, items: [], cloudSessionId: null });
  },

  hasActiveCount: (storeId) => {
    const state = get();
    const storeKey = storeKeyFor(state, storeId);
    const items =
      (storeKey ? state.drafts[storeKey] : undefined) ??
      (storeKey === state.activeStoreId ? state.items : []);
    return hasCountedAuditRow(items);
  },
}));

function reloadDraftsWrittenByAnotherTab() {
  cancelAllSaves();
  const { activeStoreId } = useStockAuditDraftStore.getState();
  useStockAuditDraftStore.setState({ drafts: {}, items: [], loadedStoreId: null });
  if (activeStoreId) void useStockAuditDraftStore.getState().loadStoreDraft(activeStoreId);
}

if (typeof window !== "undefined") {
  onWriterTabChange((isWriter) => {
    if (isWriter) reloadDraftsWrittenByAnotherTab();
  });
}

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
