import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { sync, isSyncing, SYNC_IN_PROGRESS_ERROR } from "@/lib/db/sync-engine";
import { READ_ONLY_TAB_MESSAGE } from "@/lib/db/sync-engine/sync-outcome";
import { SYNC_DISABLED_IMPERSONATION_MESSAGE } from "@/lib/utils/impersonation";
import { isExpectedPlanRestriction } from "@/lib/utils/error-logger";
import { getAuthToken } from "@/lib/storage-keys";
import { queryKeys } from "@/lib/query-keys";

export type PreAuditSyncState = "syncing" | "ready" | "stale" | "failed";

export interface PreAuditSync {
  state: PreAuditSyncState;
  error: string | null;
  retry: () => void;
  countAnyway: () => void;
}

const IN_FLIGHT_POLL_MS = 250;
const MAX_ATTEMPTS = 3;
const NO_PULL_POSSIBLE = new Set([READ_ONLY_TAB_MESSAGE, SYNC_DISABLED_IMPERSONATION_MESSAGE]);

async function waitForInFlightSync(): Promise<void> {
  while (isSyncing()) await new Promise((resolve) => setTimeout(resolve, IN_FLIGHT_POLL_MS));
}

async function attemptSync(): Promise<{ success: boolean; error: string | null }> {
  try {
    const result = await sync(true);
    return { success: result.success, error: typeof result.error === "string" ? result.error : null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Sync failed" };
  }
}

export async function pullBeforeCount(): Promise<{ state: Exclude<PreAuditSyncState, "syncing">; error: string | null }> {
  if (!navigator.onLine) return { state: "stale", error: null };
  if (!getAuthToken()) return { state: "ready", error: null };

  let result = await attemptSync();
  for (let attempt = 1; attempt < MAX_ATTEMPTS && result.error === SYNC_IN_PROGRESS_ERROR; attempt++) {
    await waitForInFlightSync();
    result = await attemptSync();
  }

  if (result.success) return { state: "ready", error: null };
  if (!navigator.onLine || NO_PULL_POSSIBLE.has(result.error ?? "") || isExpectedPlanRestriction(result.error)) {
    return { state: "stale", error: null };
  }
  return { state: "failed", error: result.error ?? "Sync failed" };
}

export function usePreAuditSync(): PreAuditSync {
  const queryClient = useQueryClient();
  const [state, setState] = useState<PreAuditSyncState>("syncing");
  const [error, setError] = useState<string | null>(null);

  const applyOutcome = useCallback(
    async (outcome: Awaited<ReturnType<typeof pullBeforeCount>>) => {
      if (outcome.state === "ready") {
        await queryClient.invalidateQueries({ queryKey: queryKeys.products.withDetails().queryKey });
      }
      setError(outcome.error);
      setState(outcome.state);
    },
    [queryClient],
  );

  useEffect(() => {
    void pullBeforeCount().then(applyOutcome);
  }, [applyOutcome]);

  return {
    state,
    error,
    retry: () => {
      setState("syncing");
      void pullBeforeCount().then(applyOutcome);
    },
    countAnyway: () => setState("stale"),
  };
}
