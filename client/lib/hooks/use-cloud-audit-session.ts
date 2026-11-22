"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  AuditSessionConflictError,
  CloudAuditSession,
  fetchActiveAuditSession,
  heartbeatAuditSession,
  startAuditSession,
  syncAuditSessionItems,
  takeoverAuditSession,
} from "@/lib/api/audit-sessions";
import { getDeviceId } from "@/lib/utils/device-id";
import { getDeviceLabel } from "@/lib/utils/device-label";
import type { AuditItem } from "@/components/stock-batch/stock-audits";
import { useStockAuditDraftStore } from "./use-stock-audit-draft";
import { hasCountedAuditRow } from "@/components/stock-batch/audit-derivations";
import {
  flushAuditSessionOps,
  queueAuditSessionOp,
} from "./cloud-audit-pending-ops";
import {
  isResumable,
  mergeCloudItemsIntoLocal,
  toCloudItem,
  unsyncedItems,
} from "./cloud-audit-session-helpers";
import { toast } from "sonner";

export { mergeCloudItemsIntoLocal, toCloudItem, unsyncedItems } from "./cloud-audit-session-helpers";

const HEARTBEAT_INTERVAL_MS = 60_000;
const SYNC_DEBOUNCE_MS = 1_500;

export function useCloudAuditSession(storeId: string | null) {
  const currentTillId = getDeviceId();
  const currentTillLabel = getDeviceLabel();

  const [session, setSession] = useState<CloudAuditSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isTakeoverOpen, setIsTakeoverOpen] = useState(false);
  const [isTakingOver, setIsTakingOver] = useState(false);
  const [draftResolution, setDraftResolution] = useState<"pending_sync" | "abandoned" | null>(null);

  const sessionRef = useRef<CloudAuditSession | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const sentItemsRef = useRef<{ sessionId: string; byProduct: Map<string, string> }>({ sessionId: "", byProduct: new Map() });
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setItems = useStockAuditDraftStore((state) => state.setItems);
  const setCloudSessionId = useStockAuditDraftStore((state) => state.setCloudSessionId);
  const clearDraft = useStockAuditDraftStore((state) => state.clearDraft);

  const handleConflict = useCallback((conflict: AuditSessionConflictError) => {
    if (conflict.session) {
      setSession(conflict.session);
      setIsReadOnly(conflict.session.active_till_id !== currentTillId);
    } else {
      setIsReadOnly(true);
    }
    setConflictMessage(conflict.message);
    toast.error(conflict.message);
  }, [currentTillId]);

  const initSession = useCallback(async (localItems: AuditItem[]) => {
    if (!storeId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const knownSessionId = useStockAuditDraftStore.getState().cloudSessionId;
      await flushAuditSessionOps();
      const res = await fetchActiveAuditSession(true, knownSessionId);
      if (res.session && res.session.status === "completion_pending_sync") {
        const affectsThisDraft =
          res.session.active_till_id !== currentTillId || knownSessionId === res.session.id;
        if (affectsThisDraft) {
          setSession(res.session);
          setIsReadOnly(true);
          setDraftResolution("pending_sync");
          setConflictMessage("Another till submitted this audit and is awaiting sync. Editing is locked until sync completes.");
        } else {
          setSession(null);
          setIsReadOnly(false);
        }
      } else if (res.session && !isResumable(res.session)) {
        setSession(null);
        setIsReadOnly(false);
      } else if (res.session) {
        if (knownSessionId && res.session.id !== knownSessionId && res.known_session_status === "completed") {
          clearDraft();
          toast.info("Previous cycle count was submitted on another till. Joined the active session.");
        }
        setSession(res.session);
        setCloudSessionId(res.session.id);
        setDraftResolution(null);
        setIsReadOnly(res.session.active_till_id !== currentTillId);
        setLastSyncedAt(res.session.last_synced_at);

        if (res.session.items && res.session.items.length > 0) {
          setItems((prev) => mergeCloudItemsIntoLocal(prev, res.session?.items));
        }
      } else if (res.known_session_status === "completed") {
        clearDraft();
        setSession(null);
        setIsReadOnly(false);
        setDraftResolution(null);
        toast.info("This cycle count was already submitted on another till.");
      } else if (res.known_session_status === "abandoned") {
        if (hasCountedAuditRow(localItems)) {
          setSession(null);
          setIsReadOnly(true);
          setDraftResolution("abandoned");
          setConflictMessage("This audit session was reset on another till, but you have unsaved local counts.");
        } else {
          setCloudSessionId(null);
          setSession(null);
          setIsReadOnly(false);
          setDraftResolution(null);
        }
      } else if (knownSessionId) {
        setSession(null);
      } else if (localItems.length > 0 && navigator.onLine) {
        const created = await startAuditSession({ items: localItems.map(toCloudItem) });
        if (created?.session) {
          setSession(created.session);
          setCloudSessionId(created.session.id);
          setIsReadOnly(false);
          setLastSyncedAt(created.session.last_synced_at);
        }
      }
    } catch (err) {
      if (err instanceof AuditSessionConflictError) {
        handleConflict(err);
      } else {
        console.warn("Unable to connect to cloud audit session. Continuing offline:", err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [storeId, currentTillId, setItems, setCloudSessionId, clearDraft, handleConflict]);

  const queueSync = useCallback((items: AuditItem[]) => {
    const cur = sessionRef.current;
    if (!cur || cur.active_till_id !== currentTillId || isReadOnly) {
      return;
    }

    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const syncKey = `${cur.id}:${cur.lease_version}`;
          if (sentItemsRef.current.sessionId !== syncKey) sentItemsRef.current = { sessionId: syncKey, byProduct: new Map() };
          const dirtyItems = unsyncedItems(sentItemsRef.current.byProduct, items.filter((i) => i.counted === true).map(toCloudItem));

          if (dirtyItems.length === 0) return;

          const res = await syncAuditSessionItems(
            cur.id,
            cur.lease_version,
            dirtyItems
          );
          dirtyItems.forEach((item) => sentItemsRef.current.byProduct.set(item.product_id, JSON.stringify(item)));
          setLastSyncedAt(res.last_synced_at);
        } catch (err) {
          if (err instanceof AuditSessionConflictError) {
            handleConflict(err);
          } else {
            console.warn("Background cloud item sync failed, will retry later:", err);
          }
        }
      })();
    }, SYNC_DEBOUNCE_MS);
  }, [currentTillId, isReadOnly, handleConflict]);

  useEffect(() => {
    if (!session || session.active_till_id !== currentTillId || isReadOnly) {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      return;
    }

    heartbeatTimerRef.current = setInterval(() => {
      void (async () => {
        const cur = sessionRef.current;
        if (!cur) return;
        try {
          const res = await heartbeatAuditSession(cur.id, cur.lease_version);
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  lease_expires_at: res.lease_expires_at,
                  lease_version: res.lease_version,
                }
              : null
          );
        } catch (err) {
          if (err instanceof AuditSessionConflictError) {
            handleConflict(err);
          }
        }
      })();
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    };
  }, [session, currentTillId, isReadOnly, handleConflict]);

  const takeover = useCallback(async (reason?: string) => {
    const cur = sessionRef.current;
    if (!cur) return;

    try {
      setIsTakingOver(true);
      const res = await takeoverAuditSession(cur.id, reason);
      setSession(res.session);
      setCloudSessionId(res.session.id);
      setDraftResolution(null);
      setIsReadOnly(false);
      setConflictMessage(null);
      setLastSyncedAt(res.session.last_synced_at);
      setIsTakeoverOpen(false);

      if (res.session.items && res.session.items.length > 0) {
        setItems((prev) => mergeCloudItemsIntoLocal(prev, res.session.items));
      }
      toast.success("Audit session taken over successfully. You now have editing rights.");
    } catch (err) {
      if (err instanceof AuditSessionConflictError) {
        handleConflict(err);
      } else {
        toast.error("Failed to take over audit session.");
      }
    } finally {
      setIsTakingOver(false);
    }
  }, [setItems, handleConflict, setCloudSessionId]);

  const complete = useCallback(async (submittedStockAuditId?: string | null) => {
    const cur = sessionRef.current;
    if (!cur || cur.active_till_id !== currentTillId) return;
    queueAuditSessionOp({
      kind: "complete",
      sessionId: cur.id,
      leaseVersion: cur.lease_version,
      submittedStockAuditId: submittedStockAuditId || null,
      storeId: cur.store_id,
    });
    sessionRef.current = null;
    setSession(null);
    await flushAuditSessionOps();
  }, [currentTillId]);

  const abandon = useCallback(async (reason?: string) => {
    const cur = sessionRef.current;
    if (!cur || cur.active_till_id !== currentTillId) return;
    queueAuditSessionOp({
      kind: "abandon",
      sessionId: cur.id,
      reason,
      leaseVersion: cur.lease_version,
      storeId: cur.store_id,
    });
    sessionRef.current = null;
    setSession(null);
    setIsReadOnly(false);
    await flushAuditSessionOps();
  }, [currentTillId]);

  useEffect(() => {
    const retry = () => {
      void flushAuditSessionOps();
      const items = useStockAuditDraftStore.getState().items;
      if (sessionRef.current) queueSync(items);
      else void initSession(items);
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [initSession, queueSync]);

  const discardAbandonedDraft = useCallback(() => {
    clearDraft();
    setDraftResolution(null);
    setIsReadOnly(false);
    setConflictMessage(null);
  }, [clearDraft]);

  const restartAbandonedAsNewSession = useCallback(async () => {
    setCloudSessionId(null);
    setDraftResolution(null);
    setIsReadOnly(false);
    setConflictMessage(null);
    await initSession(useStockAuditDraftStore.getState().items);
  }, [setCloudSessionId, initSession]);

  return {
    session,
    isLoading,
    isReadOnly,
    conflictMessage,
    draftResolution,
    lastSyncedAt,
    isTakeoverOpen,
    setIsTakeoverOpen,
    isTakingOver,
    currentTillId,
    currentTillLabel,
    initSession,
    queueSync,
    takeover,
    complete,
    abandon,
    discardAbandonedDraft,
    restartAbandonedAsNewSession,
  };
}
