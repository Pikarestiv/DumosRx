"use client";

import { useEffect, useState } from "react";
import { X, Minus, Square, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isTauri } from "@/lib/db/core";

export function TauriTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isTauri()) {
      setShow(true);
      
      const updateMaximized = async () => {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const appWindow = getCurrentWindow();
          const maximized = await appWindow.isMaximized();
          setIsMaximized(maximized);
        } catch (e) {
          console.error("Failed to check maximized state", e);
        }
      };

      updateMaximized();
      
      // Listen for resize events to update maximized state
      let unlisten: (() => void) | undefined;
      const setupListener = async () => {
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          const appWindow = getCurrentWindow();
          unlisten = await appWindow.onResized(() => {
            updateMaximized();
          });
        } catch (e) {
          console.error("Failed to setup window listener", e);
        }
      };
      
      setupListener();
      return () => {
        if (unlisten) unlisten();
      };
    }
  }, []);

  if (!show) return null;

  const handleMinimize = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().minimize();
  };

  const handleMaximize = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().toggleMaximize();
  };

  const handleClose = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  };

  return (
    <div 
      data-tauri-drag-region 
      className="h-8 bg-background border-b border-border flex items-center justify-between px-2 select-none z-[9999] relative"
    >
      <div className="flex items-center gap-2 px-2 pointer-events-none">
        <img src="/favicon.svg" alt="" className="h-4 w-4" />
        <span className="text-xs font-medium text-muted-foreground">DumosRx</span>
      </div>
      
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-10 rounded-none hover:bg-muted"
          onClick={handleMinimize}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-10 rounded-none hover:bg-muted"
          onClick={handleMaximize}
        >
          {isMaximized ? (
            <Copy className="h-3 w-3" />
          ) : (
            <Square className="h-3 w-3" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-10 rounded-none hover:bg-destructive hover:text-destructive-foreground"
          onClick={handleClose}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
