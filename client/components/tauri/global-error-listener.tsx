"use client";

import { useEffect, ReactNode } from "react";
import { logCrash } from "@/lib/utils/error-logger";
import { devLog } from "@/lib/utils/dev-log";

// Benign browser-internal notices that show up as window "error" events but
// don't indicate anything actually broke — e.g. ResizeObserver's loop-limit
// warnings, which commonly fire when a dropdown/popover measures itself on
// open. Not real crashes; don't log them as ones.
const IGNORED_ERROR_PATTERNS = [/^ResizeObserver loop/i];

function isIgnorableError(message: unknown): boolean {
  const text = typeof message === "string" ? message : (message as any)?.message;
  return typeof text === "string" && IGNORED_ERROR_PATTERNS.some((re) => re.test(text));
}

export function GlobalErrorListener({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleError = (event: ErrorEvent) => {
      if (isIgnorableError(event.error || event.message)) return;
      logCrash(event.error || event.message, true);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isIgnorableError(event.reason)) return;
      logCrash(event.reason, true);
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
