import { useEffect, useState } from "react";
import { pullBeforeCount, withDeadline } from "@/lib/hooks/use-pre-audit-sync";

export type SyncOnOpenState = "syncing" | "synced" | "not-refreshed";

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

  return state;
}
