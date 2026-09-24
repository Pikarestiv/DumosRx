/**
 * DatabaseProvider - Initializes local SQLite database on app load
 */

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { initDatabase, isTauri, isWriterTab, onWriterTabChange } from "./local-database";
import { devLog } from "@/lib/utils/dev-log";
import { toast } from "sonner";

interface DatabaseContextType {
  isReady: boolean;
  isOffline: boolean;
  isTauriApp: boolean;
  isReadOnlyTab: boolean;
  error: Error | null;
}

const DatabaseContext = createContext<DatabaseContextType>({
  isReady: false,
  isOffline: false,
  isTauriApp: false,
  isReadOnlyTab: false,
  error: null,
});

export function useDatabase() {
  return useContext(DatabaseContext);
}

interface DatabaseProviderProps {
  children: ReactNode;
}

export function DatabaseProvider({ children }: DatabaseProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [isReadOnlyTab, setIsReadOnlyTab] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const isTauriApp = isTauri();

  // Initialize database
  useEffect(() => {
    initDatabase()
      .then(() => {
        setIsReady(true);
        // Reflects tab-lock.ts's single-writer election (see C1 in
        // docs/KNOWN_BUGS.md) - initDatabase() has already registered this
        // tab's lock request by the time it resolves, so isWriterTab()'s
        // current value plus this subscription together cover both the
        // initial state and any later promotion.
        setIsReadOnlyTab(!isWriterTab());
        devLog("[DB] Local database initialized");
        // Flush any offline crashes queued in localStorage
        import("@/lib/utils/error-logger").then(({ flushPendingCrashes }) => {
          flushPendingCrashes().catch(console.error);
        }).catch(console.error);
        // One-time-per-boot cleanup of any leftover "draft" purchase orders
        import("@/lib/db/queries/procurement").then(({ promoteDraftPurchaseOrdersToPending }) => {
          promoteDraftPurchaseOrdersToPending().catch(console.error);
        }).catch(console.error);
        // One-time-per-boot repair for rows left with no _sync_queue entry
        // by a write that was interrupted between its row INSERT and its
        // queue INSERT (e.g. iOS killing a backgrounded PWA tab mid-write) -
        // insert()/update()/etc. in base-helpers.ts now do those atomically
        // going forward, but this backfills anything already stranded from
        // before that fix, or from any write path that still bypasses those
        // helpers. Previously requeueOrphanedRows() only ran from inside
        // remapForeignKey()'s identity-reconcile path, never at plain launch.
        Promise.all([
          import("@/lib/db/reconcile-identity"),
          import("@/lib/db/schema-migrations"),
        ]).then(([{ requeueOrphanedRows }, { STORE_SCOPED_TABLES }]) => {
          requeueOrphanedRows(STORE_SCOPED_TABLES).catch(console.error);
        }).catch(console.error);
      })
      .catch((err) => {
        console.error("[DB] Failed to initialize database:", err);
        setError(err);
      });
  }, []);

  // Online/offline detection
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      setIsOffline(false);
      devLog("[DB] Network: online");
    };

    const handleOffline = () => {
      setIsOffline(true);
      devLog("[DB] Network: offline");
    };

    setIsOffline(!navigator.onLine);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Tracks this tab's writer/read-only role (see tab-lock.ts / C1 in
  // docs/KNOWN_BUGS.md) for as long as the provider is mounted, so a
  // promotion (the writer tab elsewhere closing) updates the UI without
  // needing a reload.
  useEffect(() => {
    return onWriterTabChange((isWriter) => {
      setIsReadOnlyTab(!isWriter);
      if (isWriter) {
        toast.success("This tab can now save changes.", { duration: 5000 });
      }
    });
  }, []);

  // Every write attempt from a read-only tab throws (core.ts's
  // assertWritable()) so nothing is silently dropped, but a thrown error
  // alone can look like a generic failure. Rate-limited the same way
  // dumos_db_save_failed is below, so repeatedly tapping a disabled-looking
  // action doesn't spam toasts.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let lastShownAt = 0;
    const handleBlocked = () => {
      const now = Date.now();
      if (now - lastShownAt < 10000) return;
      lastShownAt = now;
      toast.error(
        "This tab is read-only - DumosRx is already open in another tab or window.",
        { duration: 8000 },
      );
    };
    window.addEventListener("dumos_db_read_only_write_blocked", handleBlocked);
    return () =>
      window.removeEventListener("dumos_db_read_only_write_blocked", handleBlocked);
  }, []);

  // core.ts's saveDatabase() previously only console.error'd a failed local
  // persist (most plausibly a full IndexedDB quota, on the same per-origin
  // storage budget the PWA's precache competes against) - the app kept
  // looking completely healthy while writes silently stopped persisting.
  // Surfaced here (rate-limited at the dispatch site in core.ts) so the user
  // has some signal before everything since the last successful save is
  // lost on next launch.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleSaveFailed = () => {
      toast.error("Unable to save local data - your device may be low on storage.", {
        duration: 10000,
      });
    };
    window.addEventListener("dumos_db_save_failed", handleSaveFailed);
    return () => window.removeEventListener("dumos_db_save_failed", handleSaveFailed);
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 text-destructive mb-2">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-3xl font-serif font-black tracking-tight">Database Error</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            DumosRx encountered a critical error while setting up your local database:
            <code className="block mt-3 p-3 bg-muted rounded-lg text-left text-xs overflow-x-auto text-destructive font-mono border">
              {error.message || String(error)}
            </code>
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg shadow-lg hover:bg-primary/90 transition-all text-sm cursor-pointer"
            >
              Retry Connection
            </button>
            <button
              onClick={() => {
                if (window.confirm("Warning: This will clear all local data. Are you sure you want to proceed?")) {
                  localStorage.clear();
                  window.location.reload();
                }
              }}
              className="px-5 py-2.5 bg-background border hover:bg-muted text-foreground font-semibold rounded-lg transition-all text-sm cursor-pointer"
            >
              Reset App Data
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DatabaseContext.Provider
      value={{ isReady, isOffline, isTauriApp, isReadOnlyTab, error }}
    >
      {isReadOnlyTab && (
        <div className="sticky top-0 z-50 w-full bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-amber-950">
          Read-only tab — DumosRx is already open elsewhere. Switch to that
          tab, or close it, to make changes here.
        </div>
      )}
      {children}
    </DatabaseContext.Provider>
  );
}
