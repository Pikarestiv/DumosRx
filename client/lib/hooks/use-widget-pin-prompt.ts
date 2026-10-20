"use client";

import { useCallback, useEffect, useState } from "react";
import { isTauri } from "@/lib/db";
import { requestPinWidget } from "@/lib/native/widget-bridge";
import { STORAGE_KEYS } from "@/lib/storage-keys";

const DISMISSED_KEY = STORAGE_KEYS.widgetPromptDismissed;

// Drives the Action Center "Add Widget" card:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-widget-pin-prompt-L10
export function useWidgetPinPrompt() {
  const [isAndroidApp, setIsAndroidApp] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!isTauri()) return;
    setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
    import("@tauri-apps/plugin-os")
      .then(({ type }) => setIsAndroidApp(type() === "android"))
      .catch(() => {});
  }, []);

  const dismissWidgetPrompt = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
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
