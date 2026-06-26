import { useEffect } from "react";

/**
 * A hook that listens for the 'dumos_sync_completed' global event
 * and triggers the provided callback. Useful for automatically 
 * refetching data in UI components after a background sync.
 */
export function useSyncListener(callback: () => void, listenForTables?: string[], dependencies: any[] = []) {
  useEffect(() => {
    const handleSync = (e: Event) => {
      // If we don't care about specific tables, always fire
      if (!listenForTables || listenForTables.length === 0) {
        callback();
        return;
      }

      // If it's a CustomEvent with updated tables, check for overlap
      if (e instanceof CustomEvent && e.detail?.updatedTables) {
        const updatedTables: string[] = e.detail.updatedTables;
        const hasOverlap = listenForTables.some(t => updatedTables.includes(t));
        if (hasOverlap) {
          callback();
        }
      } else {
        // Fallback for generic event
        callback();
      }
    };

    window.addEventListener("dumos_sync_completed", handleSync);
    return () => {
      window.removeEventListener("dumos_sync_completed", handleSync);
    };
  }, [callback, listenForTables, ...dependencies]);
}
