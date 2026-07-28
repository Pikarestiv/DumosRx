"use client";

import { createContext, useContext, useEffect, useRef } from "react";

type RefreshHandler = () => Promise<void> | void;

interface PullToRefreshContextValue {
  setHandler: (fn: RefreshHandler | null) => void;
  getHandler: () => RefreshHandler | null;
}

const PullToRefreshContext = createContext<PullToRefreshContextValue | null>(
  null,
);

export function PullToRefreshProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const handlerRef = useRef<RefreshHandler | null>(null);

  const value: PullToRefreshContextValue = {
    setHandler: (fn) => {
      handlerRef.current = fn;
    },
    getHandler: () => handlerRef.current,
  };

  return (
    <PullToRefreshContext.Provider value={value}>
      {children}
    </PullToRefreshContext.Provider>
  );
}

/**
 * Lets the currently-mounted page register extra refresh logic (e.g. its own
 * manual refetch function) that runs when the user pulls-to-refresh at the
 * DashboardLayout level. Only one page's handler is active at a time — the
 * most recently mounted one wins, and it's cleared on unmount so a stale
 * page's refresh logic doesn't run after navigating away.
 */
export function usePullToRefreshHandler(fn: RefreshHandler) {
  const ctx = useContext(PullToRefreshContext);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!ctx) return;
    ctx.setHandler(() => fnRef.current());
    return () => ctx.setHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function usePullToRefreshDispatcher() {
  const ctx = useContext(PullToRefreshContext);
  return () => ctx?.getHandler() ?? null;
}
