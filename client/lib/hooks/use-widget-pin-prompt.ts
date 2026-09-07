"use client";

import { useCallback, useEffect, useState } from "react";
import { isTauri } from "@/lib/db";
import { requestPinWidget } from "@/lib/native/widget-bridge";

const DISMISSED_KEY = "dumos_widget_prompt_dismissed";

/**
 * Drives the Action Center "Add Widget" card: only relevant on the Android
 * Tauri build (the only platform with a home-screen widget to pin), and
 * only until the user either adds it or dismisses the prompt. There's no
 * reliable way to detect from JS whether the widget is already pinned
 * (Android exposes no such query without a matching AppWidgetManager call
 * on the native side, and the existing bridge is fire-and-forget), so a
 * click is treated as "done" and just dismisses the card the same way
 * explicit dismissal does.
 */
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
