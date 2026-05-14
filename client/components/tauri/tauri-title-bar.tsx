"use client"

import { useEffect, useState } from "react"
import { X, Minus, Square, Copy } from "lucide-react"
import { cn } from "@/lib/utils"

export function TauriTitleBar() {
  const [isTauri, setIsTauri] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [platform, setPlatform] = useState<string>("windows")

  useEffect(() => {
    const init = async () => {
      if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
        setIsTauri(true)
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window")
          const { type } = await import("@tauri-apps/plugin-os")
          
          const appWindow = getCurrentWindow()
          setPlatform(type())
          
          const maximized = await appWindow.isMaximized()
          setIsMaximized(maximized)

          const unlisten = await appWindow.onResized(async () => {
            const isMax = await appWindow.isMaximized()
            setIsMaximized(isMax)
          })

          return () => {
            unlisten()
          }
        } catch (e) {
          console.error("Tauri API error:", e)
        }
      }
    }
    init()
  }, [])

  if (!isTauri) return null

  const handleMinimize = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window")
    await getCurrentWindow().minimize()
  }

  const handleMaximize = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window")
    await getCurrentWindow().toggleMaximize()
  }

  const handleClose = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window")
    await getCurrentWindow().close()
  }

  const isMac = platform === "macos" || platform === "darwin"

  return (
    <div
      data-tauri-drag-region
      onDoubleClick={handleMaximize}
      className={cn(
        "fixed top-0 left-0 right-0 h-10 z-[9999] flex items-center select-none bg-background/80 backdrop-blur-md border-b border-border/50 transition-colors",
        isMac ? "flex-row-reverse px-4" : "flex-row justify-between"
      )}
    >
      {!isMac && (
        <div className="flex items-center px-4 gap-2 pointer-events-none" data-tauri-drag-region>
          <img src="/favicon.svg" alt="" className="h-4 w-4" />
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-70">
            DumosRx
          </span>
        </div>
      )}

      {isMac && (
        <div className="flex-1 text-center pointer-events-none" data-tauri-drag-region>
           <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] opacity-50">
            Secure Session
          </span>
        </div>
      )}

      <div className={cn("flex items-center h-full", isMac ? "gap-2" : "")}>
        {isMac ? (
          <>
            <button
              onClick={handleClose}
              className="w-3 h-3 rounded-full bg-[#ff5f57] hover:bg-[#ff5f57]/80 border border-black/10 transition-colors"
              aria-label="Close"
            />
            <button
              onClick={handleMinimize}
              className="w-3 h-3 rounded-full bg-[#ffbd2e] hover:bg-[#ffbd2e]/80 border border-black/10 transition-colors"
              aria-label="Minimize"
            />
            <button
              onClick={handleMaximize}
              className="w-3 h-3 rounded-full bg-[#28c940] hover:bg-[#28c940]/80 border border-black/10 transition-colors"
              aria-label="Maximize"
            />
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
  )
}
