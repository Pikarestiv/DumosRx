"use client";

import { useEffect } from "react";

/**
 * Registers the admin service worker, scoped to /admin/ so installing the
 * panel never takes over the marketing site or a store owner's dashboard.
 * See public/admin-sw.js for why it caches no platform data.
 */
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

  // Injected here rather than in the root layout's metadata: a site-wide
  // manifest would offer to install the ADMIN app from the marketing site.
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "/admin-manifest.webmanifest";
    document.head.appendChild(link);

    const theme = document.createElement("meta");
    theme.name = "theme-color";
    theme.content = "#0f172a";
    document.head.appendChild(theme);

    return () => {
      link.remove();
      theme.remove();
    };
  }, []);

  return null;
}
