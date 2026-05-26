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
import { initDatabase, isTauri } from "./local-database";

interface DatabaseContextType {
  isReady: boolean;
  isOffline: boolean;
  isTauriApp: boolean;
  error: Error | null;
}

const DatabaseContext = createContext<DatabaseContextType>({
  isReady: false,
  isOffline: false,
  isTauriApp: false,
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
  const [error, setError] = useState<Error | null>(null);
  const isTauriApp = isTauri();

  // Initialize database
  useEffect(() => {
    initDatabase()
      .then(() => {
        setIsReady(true);
        console.log("[DB] Local database initialized");
        // Flush any offline crashes queued in localStorage
        import("@/lib/utils/error-logger").then(({ flushPendingCrashes }) => {
          flushPendingCrashes().catch(console.error);
        });
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
      console.log("[DB] Network: online");
    };

    const handleOffline = () => {
      setIsOffline(true);
      console.log("[DB] Network: offline");
    };

    setIsOffline(!navigator.onLine);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
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
    <DatabaseContext.Provider value={{ isReady, isOffline, isTauriApp, error }}>
      {children}
    </DatabaseContext.Provider>
  );
}
