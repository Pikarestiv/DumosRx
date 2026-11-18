import { useEffect, useState } from "react";
import { pullBeforeCount, withDeadline } from "@/lib/hooks/use-pre-audit-sync";
import { readSyncOutcome } from "@/lib/db/sync-engine/sync-outcome";

export type SyncOnOpenState = "syncing" | "synced" | "not-refreshed";

export const SYNC_RECOVERY_POLL_MS = 2_000;

export function useSyncOnOpen(): SyncOnOpenState {
  const [state, setState] = useState<SyncOnOpenState>("syncing");

  useEffect(() => {
    let cancelled = false;
    void withDeadline(pullBeforeCount(() => cancelled)).then((result) => {
      if (!result || cancelled) return;
      setState(result.state === "ready" ? "synced" : "not-refreshed");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state !== "not-refreshed") return;
    const staleSince = Date.now();
    const timer = setInterval(() => {
      const outcome = readSyncOutcome();
      if (outcome?.success && Date.parse(outcome.at) >= staleSince) setState("synced");
    }, SYNC_RECOVERY_POLL_MS);
    return () => clearInterval(timer);
  }, [state]);

  return state;
}
