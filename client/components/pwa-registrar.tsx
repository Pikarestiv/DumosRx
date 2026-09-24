"use client";

import { useEffect } from "react";

export function PwaRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Service worker registration failed", err);
      });
    };

    // On a warm load (e.g. served from the HTTP cache) `window` can fire
    // "load" before this effect commits, so the listener below would attach
    // to an event that already happened and the SW would silently never
    // register on that visit - leaving the browser's own offline page to
    // take over the next time the device goes offline.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
