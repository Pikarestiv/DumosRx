"use client";

import { useEffect } from "react";
import { toast } from "sonner";
// Side-effect import only: attaches use-install-prompt.ts's module-level
// "beforeinstallprompt" listener as early as this always-mounted-at-root
// component's own JS, instead of only once AndroidInstallCard happens to
// mount (which is too late - see that module's comment).
import "@/lib/hooks/use-install-prompt";
import { isDevelopment } from "@/lib/constants";

// sw.js calls skipWaiting()/clients.claim() unconditionally on every
// install, so a new deploy's worker takes over an already-open tab without
// asking. Without reloading, that tab keeps running the OLD build's already-
// loaded JavaScript against the NEW build's cache/manifest - e.g. a
// client-side navigation's ".txt" RSC fetch (cache key normalized to
// pathname only, see sw.js) would be served the new build's payload under
// the old page's still-running code, which Next's own build-ID mismatch
// handling usually catches and force-reloads anyway, but not reliably. This
// reloads deliberately and visibly instead of leaving that mismatch to
// happen implicitly mid-session. The POS cart survives this: it's persisted
// to localStorage (zustand persist), not in-memory state.
let hasReloadedForUpdate = false;

export function PwaRegistrar() {
  useEffect(() => {
    // precache-manifest.json is a build artifact that never exists under
    // `next dev` - see docs/FIXED_BUGS.md for why registering here 404s.
    if (isDevelopment) return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          // This SPA's routing is entirely client-side once loaded, so a
          // terminal left open across a shift (or, installed, across days)
          // may never make another document navigation - the one thing that
          // makes a browser re-check sw.js against the network. Without an
          // explicit update() call, such a tab could simply never discover a
          // new deploy. Checked once now and again whenever the tab becomes
          // visible, rather than on a timer that keeps firing while the
          // device is backgrounded/offline.
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

    // On a warm load (e.g. served from the HTTP cache) `window` can fire
    // "load" before this effect commits, so the listener below would attach
    // to an event that already happened and the SW would silently never
    // register on that visit - leaving the browser's own offline page to
    // take over the next time the device goes offline.
    let cleanup: (() => void) | undefined;
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
      cleanup = () => window.removeEventListener("load", register);
    }

    const handleControllerChange = () => {
      if (hasReloadedForUpdate) return;
      hasReloadedForUpdate = true;
      // Reloads immediately rather than after a delay to let the toast be
      // seen (the original version waited 1200ms): sw.js's activate() prunes
      // cache entries not in the new build's manifest BEFORE clients.claim()
      // fires this event, so by the time this handler runs, the old build's
      // chunks are already gone from both cache and (on a real deploy) the
      // server. Every millisecond this tab keeps running the old build's
      // already-loaded JS during that window is a chance for some lazy
      // import() to request one of those now-gone chunks - confirmed live as
      // "TypeError: Cannot read properties of undefined (reading 'call')"
      // (a stale chunk reference webpack's runtime can no longer resolve),
      // which the 1200ms delay was directly responsible for widening from a
      // near-zero window into an actually-hit one.
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
