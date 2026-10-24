"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";

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

  // Stable for the provider's lifetime:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-pull-to-refresh-context-tsx-L23
  const value = useMemo<PullToRefreshContextValue>(
    () => ({
      setHandler: (fn) => {
        handlerRef.current = fn;
      },
      getHandler: () => handlerRef.current,
    }),
    [],
  );

  return (
    <PullToRefreshContext.Provider value={value}>
      {children}
    </PullToRefreshContext.Provider>
  );
}

// Lets the currently-mounted page register extra refresh logic (e.g.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#context-pull-to-refresh-context-tsx-L43
export function usePullToRefreshHandler(fn: RefreshHandler) {
  const ctx = useContext(PullToRefreshContext);
  const fnRef = useRef(fn);

  useEffect(() => {
    fnRef.current = fn;
  });

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
