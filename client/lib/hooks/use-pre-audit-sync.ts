import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sync, isSyncing, SYNC_IN_PROGRESS_ERROR } from "@/lib/db/sync-engine";
import { READ_ONLY_TAB_MESSAGE, isPushBatchesFailedError } from "@/lib/db/sync-engine/sync-outcome";
import { SYNC_DISABLED_IMPERSONATION_MESSAGE } from "@/lib/utils/impersonation";
import { isExpectedPlanRestriction } from "@/lib/utils/error-logger";
import { getAuthToken } from "@/lib/storage-keys";
import { queryKeys } from "@/lib/query-keys";
import { readSyncOutcome } from "@/lib/db/sync-engine/sync-outcome";
import { APP_EVENTS, onAppEvent } from "@/lib/events";

export type PreAuditSyncState = "syncing" | "ready" | "stale" | "failed";

export interface PreAuditSync {
  state: PreAuditSyncState;
  error: string | null;
  notice: string | null;
  retry: () => void;
  countAnyway: () => void;
}

interface PreAuditOutcome {
  state: Exclude<PreAuditSyncState, "syncing">;
  error: string | null;
  notice: string | null;
}

export const PRE_COUNT_PULL_DEADLINE_MS = 60_000;
const IN_FLIGHT_WAIT_CAP_MS = PRE_COUNT_PULL_DEADLINE_MS;
const IN_FLIGHT_POLL_MS = 250;
const RECOVERY_POLL_MS = 2_000;
const MAX_ATTEMPTS = 3;
const NO_PULL_POSSIBLE = new Set([READ_ONLY_TAB_MESSAGE, SYNC_DISABLED_IMPERSONATION_MESSAGE]);
const PUSH_FAILED_NOTICE =
  "The latest stock is in, but some changes from this till didn't upload yet. They retry automatically.";
const DEADLINE_ERROR = "Syncing is taking too long.";

const outcome = (state: PreAuditOutcome["state"], error: string | null = null, notice: string | null = null) => ({
  state,
  error,
  notice,
});

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForInFlightSync(isCancelled: () => boolean): Promise<void> {
  const deadline = Date.now() + IN_FLIGHT_WAIT_CAP_MS;
  while (isSyncing() && !isCancelled() && Date.now() < deadline) await pause(IN_FLIGHT_POLL_MS);
}

async function attemptSync(): Promise<{ success: boolean; error: string | null }> {
  try {
    const result = await sync(true);
    return { success: result.success, error: typeof result.error === "string" ? result.error : null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Sync failed" };
  }
}

export async function pullBeforeCount(isCancelled: () => boolean = () => false): Promise<PreAuditOutcome | null> {
  if (!navigator.onLine) return outcome("stale");
  if (!getAuthToken()) return outcome("ready");

  await Promise.resolve();
  if (isCancelled()) return null;

  let result = await attemptSync();
  for (let attempt = 1; attempt < MAX_ATTEMPTS && result.error === SYNC_IN_PROGRESS_ERROR; attempt++) {
    await waitForInFlightSync(isCancelled);
    if (isCancelled()) return null;
    result = await attemptSync();
  }

  if (result.success) return outcome("ready");
  if (isPushBatchesFailedError(result.error)) return outcome("ready", null, PUSH_FAILED_NOTICE);
  if (isExpectedPlanRestriction(result.error)) return outcome("ready");
  if (!navigator.onLine || NO_PULL_POSSIBLE.has(result.error ?? "")) return outcome("stale");
  return outcome("failed", result.error ?? "Sync failed");
}

export function withDeadline(
  pull: Promise<PreAuditOutcome | null>,
  onTimeout?: () => void,
): Promise<PreAuditOutcome | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<PreAuditOutcome>((resolve) => {
    timer = setTimeout(() => {
      onTimeout?.();
      resolve(outcome("failed", DEADLINE_ERROR));
    }, PRE_COUNT_PULL_DEADLINE_MS);
  });
  return Promise.race([pull, expiry]).finally(() => clearTimeout(timer));
}

export function isBlockedBySync(presync: Pick<PreAuditSync, "state">): boolean {
  return presync.state === "syncing" || presync.state === "failed";
}

export function usePreAuditSync(): PreAuditSync {
  const queryClient = useQueryClient();
  const [state, setState] = useState<PreAuditSyncState>("syncing");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const generationRef = useRef(0);

  const run = useCallback(() => {
    const generation = ++generationRef.current;
    let stopped = false;
    let timedOut = false;
    const isEffectCancelled = () => stopped || generation !== generationRef.current;
    const isPullCancelled = () => isEffectCancelled() || timedOut;
    void withDeadline(pullBeforeCount(isPullCancelled), () => {
      timedOut = true;
    }).then(async (result) => {
      if (!result || isEffectCancelled()) return;
      if (result.state === "ready") {
        await queryClient.invalidateQueries({ queryKey: queryKeys.products.withDetails().queryKey });
      }
      if (isEffectCancelled()) return;
      setError(result.error);
      setNotice(result.notice);
      setState(result.state);
    });
    return () => {
      stopped = true;
      generationRef.current++;
    };
  }, [queryClient]);

  useEffect(() => run(), [run]);

  useEffect(() => {
    if (state !== "failed") return;
    const failedSince = Date.now();
    let recovered = false;

    const tryRecover = () => {
      if (recovered) return;
      const syncOutcome = readSyncOutcome();
      if (!syncOutcome || Date.parse(syncOutcome.at) < failedSince) return;
      const pullCompleted = syncOutcome.success || syncOutcome.reason === "batches_failed";
      if (!pullCompleted) return;
      recovered = true;
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.withDetails().queryKey }).then(() => {
        setError(null);
        setNotice(syncOutcome.reason === "batches_failed" ? PUSH_FAILED_NOTICE : null);
        setState("ready");
      });
    };

    const unsubscribe = onAppEvent(APP_EVENTS.syncCompleted, () => {
      queueMicrotask(tryRecover);
    });
    const timer = setInterval(tryRecover, RECOVERY_POLL_MS);

    return () => {
      recovered = true;
      unsubscribe();
      clearInterval(timer);
    };
  }, [state, queryClient]);

  return {
    state,
    error,
    notice,
    retry: () => {
      setState("syncing");
      run();
    },
    countAnyway: () => setState("stale"),
  };
}
