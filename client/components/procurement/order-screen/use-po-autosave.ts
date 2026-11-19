"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { refreshDraftLock, releaseDraftLock, saveDraftOrder, type DraftLockHolder, type DraftSaveOutcome } from "@/lib/db/procurement-draft";
import { isEmptyDraft } from "@/lib/db/procurement-empty-drafts";
import { getDeviceId } from "@/lib/utils/device-id";
import { getDeviceLabel } from "@/lib/utils/device-label";
import { getStoredUser } from "@/lib/storage-keys";
import { getOrderSyncState } from "@/lib/db/queries/procurement-draft-status";
import { createAutosaveScheduler, type AutosaveScheduler, type AutosaveState } from "@/lib/utils/autosave-scheduler";
import { registerBeforeReload } from "@/lib/utils/reload-guard";
import { toSnapshot } from "./po-draft-snapshot";
import { useLockHeartbeat } from "./use-lock-heartbeat";
import type { PoDraft } from "./po-draft-state";

export const AUTOSAVE_DEBOUNCE_MS = 700;
const SYNC_POLL_MS = 4000;

interface UsePoAutosaveOptions {
  orderId: string;
  draftRef: React.MutableRefObject<PoDraft>;
  initiallyPersisted: boolean;
  enabled: boolean;
  onLineIdsRemapped: (idMap: Map<string, string>) => void;
  onCreated: () => void;
  onLeftEmpty: (orderId: string) => void;
}

export type BlockedReason = Extract<DraftSaveOutcome, "not_editable" | "deleted" | "locked" | "stale">;

const BLOCKING_OUTCOMES = new Set<DraftSaveOutcome>(["not_editable", "deleted", "locked", "stale"]);

function thisTill(): DraftLockHolder {
  return { deviceId: getDeviceId(), deviceLabel: getDeviceLabel(), userId: getStoredUser()?.id ?? null };
}

export function usePoAutosave(options: UsePoAutosaveOptions) {
  const { orderId, draftRef, initiallyPersisted } = options;
  const [saveState, setSaveState] = useState<AutosaveState>("idle");
  const [persisted, setPersisted] = useState(initiallyPersisted);
  const [blocked, setBlocked] = useState<BlockedReason | null>(null);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const takeOverRef = useRef(false);
  const baseRef = useRef<string | undefined>(undefined);
  const persistedRef = useRef(initiallyPersisted);
  const blockedRef = useRef<BlockedReason | null>(null);
  const orderIdRef = useRef(orderId);
  const schedulerRef = useRef<AutosaveScheduler | null>(null);
  const callbacks = useRef(options);
  useLayoutEffect(() => {
    callbacks.current = options;
    orderIdRef.current = options.orderId;
  });

  const markPersisted = useCallback((value: boolean) => {
    persistedRef.current = value;
    setPersisted(value);
  }, []);
  const markBlocked = useCallback((value: BlockedReason | null) => {
    blockedRef.current = value;
    setBlocked(value);
  }, []);

  useEffect(() => {
    const created: AutosaveScheduler = createAutosaveScheduler({
      debounceMs: AUTOSAVE_DEBOUNCE_MS,
      onState: (state) => {
        setSaveState(state);
        setSaveError(state === "error" ? created.lastError() : null);
      },
      save: async () => {
        if (!callbacks.current.enabled || blockedRef.current) return;
        const id = orderIdRef.current;
        const result = await saveDraftOrder({ ...toSnapshot(id, draftRef.current, thisTill(), takeOverRef.current), base: baseRef.current });
        if (result.outcome !== "locked") takeOverRef.current = false;
        if (result.fingerprint) baseRef.current = result.fingerprint;
        if (result.lineIdMap.size > 0) callbacks.current.onLineIdsRemapped(result.lineIdMap);
        if (result.outcome === "created") {
          markPersisted(true);
          callbacks.current.onCreated();
        }
        if (BLOCKING_OUTCOMES.has(result.outcome)) markBlocked(result.outcome as BlockedReason);
      },
    });
    schedulerRef.current = created;
    return () => created.dispose();
  }, [draftRef, markBlocked, markPersisted]);

  const scheduler = useMemo(
    () => ({
      request: (mode: "now" | "debounced") => schedulerRef.current?.request(mode),
      flush: () => schedulerRef.current?.flush() ?? Promise.resolve(),
      lastError: () => schedulerRef.current?.lastError() ?? null,
    }),
    [],
  );

  const firstOrderId = useRef(orderId);
  useEffect(() => {
    if (orderId === firstOrderId.current) return;
    baseRef.current = undefined;
    markPersisted(false);
    markBlocked(null);
    scheduler.request("now");
  }, [orderId, scheduler, markBlocked, markPersisted]);

  const leftRef = useRef(false);
  const leave = useMemo(
    () => async () => {
      if (leftRef.current) return;
      leftRef.current = true;
      await scheduler.flush();
      if (!persistedRef.current) return;
      const id = orderIdRef.current;
      await releaseDraftLock(id, getDeviceId());
      if (!scheduler.lastError() && (await isEmptyDraft(id))) callbacks.current.onLeftEmpty(id);
    },
    [scheduler],
  );

  useEffect(() => {
    leftRef.current = false;
    const flush = () => void scheduler.flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    const unregister = registerBeforeReload(() => scheduler.flush());
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      unregister();
      void leave().catch((err) => console.error("Failed to save the order on leaving", err));
    };
  }, [scheduler, leave]);

  useLockHeartbeat({
    active: persisted && blocked === null && options.enabled,
    beat: () => refreshDraftLock(orderIdRef.current, thisTill()),
  });

  const rebase = useCallback((fingerprint: string) => {
    baseRef.current = fingerprint;
    markBlocked(null);
  }, [markBlocked]);

  const takeOver = useCallback(() => {
    takeOverRef.current = true;
    markBlocked(null);
    scheduler.request("now");
  }, [markBlocked, scheduler]);

  const syncQuery = useQuery({
    queryKey: ["purchase_order_sync_state", orderId],
    queryFn: () => getOrderSyncState(orderId),
    enabled: persisted,
    refetchInterval: SYNC_POLL_MS,
    gcTime: 0,
  });

  return {
    scheduler,
    saveState,
    saveError,
    persisted,
    persistedRef,
    blocked,
    pendingWrites: syncQuery.data?.pendingWrites ?? 0,
    conflicts: syncQuery.data?.conflicts ?? [],
    lock: syncQuery.data?.lock ?? null,
    refreshSyncState: () => void syncQuery.refetch(),
    rebase,
    takeOver,
    leave,
  };
}
