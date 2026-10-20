"use client";

import { useEffect } from "react";
import { toast } from "sonner";
// Side-effect import only:
// Rationale: docs/CLIENT_COMMENTS.md#line-components-pwa-registrar-tsx-L5
import "@/lib/hooks/use-install-prompt";
import { isDevelopment } from "@/lib/constants";

// sw.js calls skipWaiting()/clients.claim() unconditionally on every install, so a new deploy's worker takes over an alrea…
// Rationale: docs/CLIENT_COMMENTS.md#line-components-pwa-registrar-tsx-L12
let hasReloadedForUpdate = false;

export function PwaRegistrar() {
  useEffect(() => {
    // precache-manifest.json is a build artifact that never exists under
    // `next dev` - see docs/FIXED_BUGS.md for why registering here 404s.
    if (isDevelopment) return;
    if (!("serviceWorker" in navigator)) return;

    // On a brand-new install (no prior service worker for this origin at all) there is no controller yet at page load; clients…
    // Rationale: docs/CLIENT_COMMENTS.md#line-components-pwa-registrar-tsx-L32
    const hadControllerAtLoad = !!navigator.serviceWorker.controller;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          // This SPA's routing is entirely client-side once loaded, so a terminal left open across a shift (or, installed, across da…
          // Rationale: docs/CLIENT_COMMENTS.md#line-components-pwa-registrar-tsx-L45
          registration.update().catch(() => {});
          const handleVisibility = () => {
            if (document.visibilityState === "visible") {
              registration.update().catch(() => {});
            }
          };
          document.addEventListener("visibilitychange", handleVisibility);
        })
        .catch((err) => {
          console.error("Service worker registration failed", err);
        });
    };

    // On a warm load (e.g. served from the HTTP cache) `window` can fire "load" before this effect commits, so the listener be…
    // Rationale: docs/CLIENT_COMMENTS.md#line-components-pwa-registrar-tsx-L66
    let cleanup: (() => void) | undefined;
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
      cleanup = () => window.removeEventListener("load", register);
    }

    const handleControllerChange = () => {
      if (!hadControllerAtLoad) return;
      if (hasReloadedForUpdate) return;
      hasReloadedForUpdate = true;
      // Reloads immediately rather than after a delay to let the toast be seen (the original version waited 1200ms):
      // Rationale: docs/CLIENT_COMMENTS.md#line-components-pwa-registrar-tsx-L83
      toast.info("App updated - reloading...");
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    return () => {
      cleanup?.();
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  return null;
}
