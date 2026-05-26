"use client";

import { useEffect, useState } from "react";
import { X, Minus, Square, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { MacCloseIcon, MacMinimizeIcon, MacMaximizeIcon } from "./icons";

export function TauriTitleBar() {
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

  if (!isTauri) return null;

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

  return (
    <div
      onMouseDown={handleMouseDown}
      className={cn(
        "tauri-titlebar fixed top-0 left-0 right-0 h-10 z-[9999] flex items-center select-none bg-background/80 backdrop-blur-md border-b border-border/50 transition-colors",
        isMac ? "flex-row-reverse pl-0 pr-4" : "flex-row justify-between",
      )}
    >
      {!isMac && (
        <div className="flex items-center px-4 gap-2 pointer-events-none">
          <img src="/favicon.svg" alt="" className="h-4 w-4" />
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-70">
            DumosRx
          </span>
        </div>
      )}

      {isMac && (
        <div className="flex-1 text-center pointer-events-none">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] opacity-50">
            Secure Session
          </span>
        </div>
      )}

      <div
        className={cn(
          "flex items-center h-full group",
          isMac ? "pl-[13px] gap-[6px]" : "px-2",
        )}
      >
        {isMac ? (
          <>
            <button
              onClick={handleClose}
              className="w-3.5 h-3.5 rounded-full bg-[#ff5f57] border border-black/10 flex items-center justify-center relative cursor-default"
              aria-label="Close"
            >
              <MacCloseIcon className="w-3.5 h-3.5 text-[#4c0002] opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <button
              onClick={handleMinimize}
              className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] border border-black/10 flex items-center justify-center relative cursor-default"
              aria-label="Minimize"
            >
              <MacMinimizeIcon className="w-3.5 h-3.5 text-[#5c3e00] opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <button
              onClick={handleMaximize}
              className="w-3.5 h-3.5 rounded-full bg-[#28c940] border border-black/10 flex items-center justify-center relative cursor-default"
              aria-label="Maximize"
            >
              <MacMaximizeIcon className="w-3.5 h-3.5 text-[#005000] opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleMinimize}
              className="w-12 h-full flex items-center justify-center hover:bg-muted transition-colors"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleMaximize}
              className="w-12 h-full flex items-center justify-center hover:bg-muted transition-colors"
            >
              {isMaximized ? (
                <Copy className="h-3 w-3" />
              ) : (
                <Square className="h-3 w-3" />
              )}
            </button>
            <button
              onClick={handleClose}
              className="w-12 h-full flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
