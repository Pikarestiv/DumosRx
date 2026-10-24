"use client";

import { useCallback, useEffect, useState } from "react";
import { isTauri } from "@/lib/db";
import { requestPinWidget } from "@/lib/native/widget-bridge";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { useHydrated } from "@/lib/hooks/use-hydrated";

const DISMISSED_KEY = STORAGE_KEYS.widgetPromptDismissed;

// Drives the Action Center "Add Widget" card:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-widget-pin-prompt-L10
export function useWidgetPinPrompt() {
  const hydrated = useHydrated();
  const [isAndroidApp, setIsAndroidApp] = useState(false);
  const [dismissedNow, setDismissedNow] = useState(false);
  const dismissed =
    dismissedNow || !hydrated || !isTauri() || localStorage.getItem(DISMISSED_KEY) === "1";

  useEffect(() => {
    if (!isTauri()) return;
    import("@tauri-apps/plugin-os")
      .then(({ type }) => setIsAndroidApp(type() === "android"))
      .catch(() => {});
  }, []);

  const dismissWidgetPrompt = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissedNow(true);
  }, []);

  const promptPinWidget = useCallback(() => {
    void requestPinWidget();
    dismissWidgetPrompt();
  }, [dismissWidgetPrompt]);

  return {
    showWidgetPrompt: isAndroidApp && !dismissed,
    promptPinWidget,
    dismissWidgetPrompt,
  };
}
