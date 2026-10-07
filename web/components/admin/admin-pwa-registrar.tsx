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

  // The root layout already emits <link rel="manifest" href="/site.webmanifest">,
  // and a browser uses the FIRST one in tree order — appending a second did
  // nothing, so installing from /admin installed the site-wide app pointing
  // at /dashboard. The existing link's href is swapped instead, and restored
  // on unmount.
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const existing = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const previousHref = existing?.getAttribute("href") ?? null;

    const link = existing ?? document.createElement("link");
    link.rel = "manifest";
    link.href = "/admin-manifest.webmanifest";

    if (!existing) {
      document.head.appendChild(link);
    }

    return () => {
      if (previousHref === null) {
        link.remove();
      } else {
        link.href = previousHref;
      }
    };
  }, []);

  return null;
}
