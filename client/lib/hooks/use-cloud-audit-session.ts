"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  AuditSessionConflictError,
  CloudAuditSession,
  CloudAuditSessionItem,
  abandonAuditSession,
  completeAuditSession,
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
import { toast } from "sonner";

const HEARTBEAT_INTERVAL_MS = 60_000;
const SYNC_DEBOUNCE_MS = 1_500;

export function toCloudItem(item: AuditItem): CloudAuditSessionItem {
  return {
    product_id: item.id,
    system_quantity: item.systemQty,
    counted_quantity: item.countedQty ?? null,
    cost_price: item.costPrice ?? null,
    counted_cost_price: item.countedCostPrice ?? null,
    selling_price: item.sellingPrice ?? null,
    counted_selling_price: item.countedSellingPrice ?? null,
    counted: Boolean(item.counted),
    notes: item.reason ?? null,
    counted_at: item.baselineQty !== undefined ? new Date().toISOString() : null,
  };
}

export function mergeCloudItemsIntoLocal(
  localItems: AuditItem[],
  cloudItems?: CloudAuditSessionItem[]
): AuditItem[] {
  if (!cloudItems || cloudItems.length === 0) return localItems;
  const cloudMap = new Map(cloudItems.map((ci) => [ci.product_id, ci]));

  return localItems.map((local) => {
    const remote = cloudMap.get(local.id);
    if (!remote) return local;

    if (
      remote.counted &&
      remote.counted_quantity !== null &&
      remote.counted_quantity !== undefined
    ) {
      return {
        ...local,
        counted: true,
        countedQty: Number(remote.counted_quantity),
        countedCostPrice:
          remote.counted_cost_price !== null && remote.counted_cost_price !== undefined
            ? Number(remote.counted_cost_price)
            : local.countedCostPrice,
        countedSellingPrice:
          remote.counted_selling_price !== null && remote.counted_selling_price !== undefined
            ? Number(remote.counted_selling_price)
            : local.countedSellingPrice,
        reason: remote.notes || local.reason,
      };
    }
    return local;
  });
}

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

  const sessionRef = useRef<CloudAuditSession | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setItems = useStockAuditDraftStore((state) => state.setItems);

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
      const res = await fetchActiveAuditSession(true);
      if (res.session) {
        setSession(res.session);
        const heldByUs = res.session.active_till_id === currentTillId;
        setIsReadOnly(!heldByUs);
        setLastSyncedAt(res.session.last_synced_at);

        if (res.session.items && res.session.items.length > 0) {
          setItems((prev) => mergeCloudItemsIntoLocal(prev, res.session?.items));
        }
      } else if (localItems.length > 0 && navigator.onLine) {
        const cloudItems = localItems.map(toCloudItem);
        const created = await startAuditSession({ items: cloudItems });
        setSession(created.session);
        setIsReadOnly(false);
        setLastSyncedAt(created.session.last_synced_at);
      }
    } catch (err) {
      if (err instanceof AuditSessionConflictError) {
        handleConflict(err);
      } else {
        // Offline or network error: continue locally uninterrupted
        console.warn("Unable to connect to cloud audit session. Continuing offline:", err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [storeId, currentTillId, setItems, handleConflict]);

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
          const dirtyItems = items
            .filter((i) => i.counted === true)
            .map(toCloudItem);

          if (dirtyItems.length === 0) return;

          const res = await syncAuditSessionItems(
            cur.id,
            cur.lease_version,
            dirtyItems
          );
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
  }, [setItems, handleConflict]);

  const complete = useCallback(async (submittedStockAuditId?: string | null) => {
    const cur = sessionRef.current;
    if (!cur || cur.active_till_id !== currentTillId) return;

    try {
      await completeAuditSession(cur.id, cur.lease_version, submittedStockAuditId);
    } catch (err) {
      console.warn("Could not mark cloud audit session completed immediately:", err);
    }
  }, [currentTillId]);

  const abandon = useCallback(async (reason?: string) => {
    const cur = sessionRef.current;
    if (!cur) return;

    try {
      await abandonAuditSession(cur.id, reason);
      setSession(null);
      setIsReadOnly(false);
    } catch (err) {
      console.warn("Could not mark cloud audit session abandoned:", err);
    }
  }, []);

  return {
    session,
    isLoading,
    isReadOnly,
    conflictMessage,
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
  };
}
