import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sync, isSyncing, SYNC_IN_PROGRESS_ERROR } from "@/lib/db/sync-engine";
import { READ_ONLY_TAB_MESSAGE, isPushBatchesFailedError } from "@/lib/db/sync-engine/sync-outcome";
import { SYNC_DISABLED_IMPERSONATION_MESSAGE } from "@/lib/utils/impersonation";
import { isExpectedPlanRestriction } from "@/lib/utils/error-logger";
import { getAuthToken } from "@/lib/storage-keys";
import { queryKeys } from "@/lib/query-keys";

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

export const PRE_COUNT_PULL_DEADLINE_MS = 25_000;
const IN_FLIGHT_WAIT_CAP_MS = 8_000;
const IN_FLIGHT_POLL_MS = 250;
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

function withDeadline(pull: Promise<PreAuditOutcome | null>): Promise<PreAuditOutcome | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<PreAuditOutcome>((resolve) => {
    timer = setTimeout(() => resolve(outcome("failed", DEADLINE_ERROR)), PRE_COUNT_PULL_DEADLINE_MS);
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
    const isCancelled = () => stopped || generation !== generationRef.current;
    void withDeadline(pullBeforeCount(isCancelled)).then(async (result) => {
      if (!result || isCancelled()) return;
      if (result.state === "ready") {
        await queryClient.invalidateQueries({ queryKey: queryKeys.products.withDetails().queryKey });
      }
      if (isCancelled()) return;
      setError(result.error);
      setNotice(result.notice);
      setState(result.state);
    });
    return () => {
      stopped = true;
    };
  }, [queryClient]);

  useEffect(() => run(), [run]);

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
