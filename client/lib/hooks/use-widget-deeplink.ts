import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Listens for a native "widget-deeplink" DOM CustomEvent, dispatched via
 * MainActivity's captured WebView reference (WryActivity.onWebViewCreate ->
 * evaluateJavascript) when the user taps a widget alert row - see
 * DumosRxWidgetContent.kt's PendingIntents and MainActivity.onNewIntent.
 * Routes the already-running app there. There's no Tauri event round-trip:
 * TauriActivity/WryActivity keep their WebView field private, so the
 * simplest reachable path from Kotlin is evaluateJavascript dispatching a
 * plain DOM event, not Tauri's Rust-mediated event system. Mounted once
 * near the app root, alongside useWidgetSnapshotSync.
 */
export function useWidgetDeeplink() {
  const router = useRouter();

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (typeof detail === "string") {
        router.push(detail);
      }
    };

    window.addEventListener("widget-deeplink", handler);
    return () => window.removeEventListener("widget-deeplink", handler);
  }, [router]);
}
