import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Listens for a native "widget-deeplink" DOM CustomEvent, dispatched via MainActivity's captured WebView reference (WryActivity.onWebViewCreat…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-widget-deeplink-L4
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
