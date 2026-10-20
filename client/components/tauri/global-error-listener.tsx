"use client";

import { useEffect, ReactNode } from "react";
import { logCrash } from "@/lib/utils/error-logger";
import { devLog } from "@/lib/utils/dev-log";
import { isChunkLoadError, shouldReloadForChunkError } from "@/lib/utils/chunk-error";
import { BUILD_SHA } from "@/lib/constants";

// Benign browser-internal notices that show up as window "error" events but don't indicate anything actually broke, e.g.
// Rationale: docs/CLIENT_COMMENTS.md#line-components-tauri-global-error-listener-tsx-L9
const IGNORED_ERROR_PATTERNS = [/^ResizeObserver loop/i];

function isIgnorableError(message: unknown): boolean {
  const text = typeof message === "string" ? message : message instanceof Error ? message.message : undefined;
  return typeof text === "string" && IGNORED_ERROR_PATTERNS.some((re) => re.test(text));
}

export function GlobalErrorListener({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Most real stale-chunk failures never reach ErrorBoundary's componentDidCatch at all:
    // Rationale: docs/CLIENT_COMMENTS.md#line-components-tauri-global-error-listener-tsx-L24
    const reloadOnChunkError = (error: unknown) => {
      if (!isChunkLoadError(error instanceof Error ? error : undefined)) return false;
      if (typeof window === "undefined") return false;
      if (!shouldReloadForChunkError(BUILD_SHA)) return false;
      window.location.reload();
      return true;
    };

    // Reload first, report only if that didn't handle it.
    // Rationale: docs/CLIENT_COMMENTS.md#line-components-tauri-global-error-listener-tsx-L38
    const handleError = (event: ErrorEvent) => {
      if (isIgnorableError(event.error || event.message)) return;
      if (reloadOnChunkError(event.error)) return;
      void logCrash(event.error || event.message, true);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isIgnorableError(event.reason)) return;
      if (reloadOnChunkError(event.reason)) return;
      void logCrash(event.reason, true);
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    devLog("[Logger] Global error listeners initialized");

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return <>{children}</>;
}
