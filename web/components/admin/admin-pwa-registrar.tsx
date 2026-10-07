"use client";

import { useEffect } from "react";

/** See web/AGENTS.md, "Admin PWA" — scope, caching policy, and where the
 * manifest link comes from (app/admin/layout.tsx, not here). */
export function AdminPwaRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // A dev build serves uncached modules; a worker holding the shell there
    // just makes hot reloads behave strangely.
    if (process.env.NODE_ENV !== "production") {
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register("/admin-sw.js", { scope: "/admin/" })
        .catch((err) => console.warn("[Admin PWA] Service worker registration failed", err));
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null;
}
