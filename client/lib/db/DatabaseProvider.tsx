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

  return (
    <DatabaseContext.Provider value={{ isReady, isOffline, isTauriApp, error }}>
      {children}
    </DatabaseContext.Provider>
  );
}
