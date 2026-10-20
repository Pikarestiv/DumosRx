import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Captures Chrome/Edge/Android's `beforeinstallprompt` event so we can defer it and trigger the native install prompt from our own "Install Ap…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-install-prompt-L8
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
