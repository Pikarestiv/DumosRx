import { useEffect, useState } from "react";

export function useTauriWindow() {
  const [isTauri, setIsTauri] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [platform, setPlatform] = useState<string>("windows");
  const [appWindow, setAppWindow] = useState<any>(null);

  useEffect(() => {
    const init = async () => {
      if (
        typeof window !== "undefined" &&
        (window as any).__TAURI_INTERNALS__
      ) {
        setIsTauri(true);
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const { type } = await import("@tauri-apps/plugin-os");

          const win = getCurrentWindow();
          setAppWindow(win);
          setPlatform(type());

          const maximized = await win.isMaximized();
          setIsMaximized(maximized);

          const unlisten = await win.onResized(async () => {
            const isMax = await win.isMaximized();
            setIsMaximized(isMax);
          });

          return () => {
            unlisten();
          };
        } catch (e) {
          console.error("Tauri API error:", e);
        }
      }
    };
    init();
  }, []);

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
    isMaximized,
    isMac,
    handleMinimize,
    handleMaximize,
    handleClose,
    handleMouseDown,
  };
}
