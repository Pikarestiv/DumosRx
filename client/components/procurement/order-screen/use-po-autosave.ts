"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { saveDraftOrder, type DraftSaveOutcome } from "@/lib/db/procurement-draft";
import { getOrderSyncState } from "@/lib/db/queries/procurement-draft-status";
import { createAutosaveScheduler, type AutosaveScheduler, type AutosaveState } from "@/lib/utils/autosave-scheduler";
import { registerBeforeReload } from "@/lib/utils/reload-guard";
import { toSnapshot } from "./po-draft-snapshot";
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
}

export type BlockedReason = Extract<DraftSaveOutcome, "not_editable" | "deleted">;

export function usePoAutosave({ orderId, draftRef, initiallyPersisted, enabled, onLineIdsRemapped, onCreated }: UsePoAutosaveOptions) {
  const [saveState, setSaveState] = useState<AutosaveState>("idle");
  const [persisted, setPersisted] = useState(initiallyPersisted);
  const [blocked, setBlocked] = useState<BlockedReason | null>(null);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const callbacks = useRef({ onLineIdsRemapped, onCreated, enabled });
  useLayoutEffect(() => {
    callbacks.current = { onLineIdsRemapped, onCreated, enabled };
  });

  const scheduler = useMemo(() => {
    const created: AutosaveScheduler = createAutosaveScheduler({
        debounceMs: AUTOSAVE_DEBOUNCE_MS,
        onState: (state) => {
          setSaveState(state);
          setSaveError(state === "error" ? created.lastError() : null);
        },
        save: async () => {
          if (!callbacks.current.enabled) return;
          const result = await saveDraftOrder(toSnapshot(orderId, draftRef.current));
          if (result.lineIdMap.size > 0) callbacks.current.onLineIdsRemapped(result.lineIdMap);
          if (result.outcome === "created") {
            setPersisted(true);
            callbacks.current.onCreated();
          }
          if (result.outcome === "not_editable" || result.outcome === "deleted") setBlocked(result.outcome);
        },
      });
    return created;
  }, [orderId, draftRef]);

  const firstOrderId = useRef(orderId);
  useEffect(() => {
    if (orderId === firstOrderId.current) return;
    setPersisted(false);
    setBlocked(null);
    scheduler.request("now");
  }, [orderId, scheduler]);

  useEffect(() => {
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
      scheduler.dispose();
    };
  }, [scheduler]);

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
    blocked,
    pendingWrites: syncQuery.data?.pendingWrites ?? 0,
    conflicts: syncQuery.data?.conflicts ?? [],
    refreshSyncState: () => void syncQuery.refetch(),
  };
}
