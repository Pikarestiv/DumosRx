"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { useTauriWindow } from "./use-tauri-window";
import { MacWindowControls } from "./mac-window-controls";
import { WindowsWindowControls } from "./windows-window-controls";

export function TauriTitleBar() {
  const {
    isTauri,
    isDesktop,
    isMaximized,
    isMac,
    handleMinimize,
    handleMaximize,
    handleClose,
    handleMouseDown,
  } = useTauriWindow();

  if (!isTauri) return null;

  if (!isDesktop) {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-[9999] bg-background"
        style={{ height: "var(--tauri-top, 0px)" }}
      />
    );
  }

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
        {isMac && (
          <MacWindowControls
            onClose={handleClose}
            onMinimize={handleMinimize}
            onMaximize={handleMaximize}
          />
        )}
        {!isMac && (
          <WindowsWindowControls
            isMaximized={isMaximized}
            onMinimize={handleMinimize}
            onMaximize={handleMaximize}
            onClose={handleClose}
          />
        )}
      </div>
    </div>
  );
}
