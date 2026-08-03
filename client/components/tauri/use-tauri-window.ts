import { useEffect, useState } from "react";
import type { Window as TauriWindow } from "@tauri-apps/api/window";

export function useTauriWindow() {
  const [isTauri, setIsTauri] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [platform, setPlatform] = useState<string>("windows");
  const [appWindow, setAppWindow] = useState<TauriWindow | null>(null);

  useEffect(() => {
    const init = async () => {
      if (
        typeof window !== "undefined" &&
        window.__TAURI_INTERNALS__
      ) {
        setIsTauri(true);
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const { type } = await import("@tauri-apps/plugin-os");

          const win = getCurrentWindow();
          setAppWindow(win);

          const osType = type();
          setPlatform(osType);

          const isDesk = ["windows", "macos", "darwin", "linux"].includes(
            osType.toLowerCase(),
          );
          setIsDesktop(isDesk);
          setIsMobile(!isDesk);

          if (isDesk) {
            const maximized = await win.isMaximized();
            setIsMaximized(maximized);

            const unlisten = await win.onResized(async () => {
              const isMax = await win.isMaximized();
              setIsMaximized(isMax);
            });

            return () => {
              unlisten();
            };
          }
        } catch (e) {
          console.error("Tauri API error:", e);
        }
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (isTauri) {
      if (isDesktop) {
        document.body.style.setProperty("--tauri-top", "40px");
        document.body.style.setProperty("--tauri-bottom", "0px");
      } else if (isMobile) {
        // We use max() because if the WebView evaluates env() to 0px, the standard env fallback is ignored.
        // max() guarantees a minimum of 24px/16px on mobile devices even if env() is falsely reported as 0px.
        document.body.style.setProperty("--tauri-top", "max(env(safe-area-inset-top), 24px)");
        document.body.style.setProperty("--tauri-bottom", "max(env(safe-area-inset-bottom), 16px)");
      }
    } else {
      document.body.style.setProperty("--tauri-top", "0px");
      document.body.style.setProperty("--tauri-bottom", "0px");
    }
  }, [isTauri, isDesktop, isMobile]);

  const handleMinimize = async () => {
    if (!appWindow) return;
    await appWindow.minimize();
  };

  const handleMaximize = async () => {
    if (!appWindow) return;
    await appWindow.toggleMaximize();
  };

  const handleClose = async () => {
    if (!appWindow) return;
    await appWindow.close();
  };

  const handleMouseDown = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;

    if (!appWindow) return;

    if (e.detail === 2) {
      await appWindow.toggleMaximize();
    } else {
      await appWindow.startDragging();
    }
  };

  const isMac = platform === "macos" || platform === "darwin";

  return {
    isTauri,
    isDesktop,
    isMaximized,
    isMac,
    handleMinimize,
    handleMaximize,
    handleClose,
    handleMouseDown,
  };
}
