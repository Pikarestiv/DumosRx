"use client";

import { useEffect, ReactNode } from "react";
import { logCrash } from "@/lib/utils/error-logger";

export function GlobalErrorListener({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleError = (event: ErrorEvent) => {
      logCrash(event.error || event.message, true);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      logCrash(event.reason, true);
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    console.log("[Logger] Global error listeners initialized");

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return <>{children}</>;
}
