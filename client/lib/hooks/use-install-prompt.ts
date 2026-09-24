import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Captures Chrome/Edge/Android's `beforeinstallprompt` event so we can defer
 * it and trigger the native install prompt from our own "Install App" button
 * instead of relying on the browser's own (easy-to-miss) mini-infobar.
 * Fires only on Chromium-based browsers that judge the site installable
 * (valid manifest + registered service worker + https). Safari/iOS never
 * fires this, which is why that platform gets its own instructions modal.
 *
 * The listener is registered at MODULE scope, not inside useInstallPrompt()'s
 * effect: `beforeinstallprompt` fires once, early, during initial page load,
 * and this module previously was only ever imported by AndroidInstallCard -
 * which only mounts once a user navigates to Settings, long after the event
 * had already fired and been discarded. That meant the install card almost
 * never appeared on Chrome/Android at all. Import this module from something
 * mounted at the app root (see pwa-registrar.tsx) so the listener attaches
 * as early as the rest of the app's JS does, and expose the captured event
 * through a tiny external store so any component - regardless of when it
 * mounts - can read it.
 */
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    notify();
  });
}

export function useInstallPrompt() {
  const [, forceRerender] = useState(0);

  useEffect(() => {
    const listener = () => forceRerender((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      installed = true;
    }
    deferredPrompt = null;
    notify();
  };

  return {
    canInstall: !!deferredPrompt && !installed,
    promptInstall,
  };
}
