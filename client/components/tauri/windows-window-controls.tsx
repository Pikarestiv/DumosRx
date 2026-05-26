import React from "react";
import { Minus, Square, Copy, X } from "lucide-react";

interface WindowsWindowControlsProps {
  isMaximized: boolean;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
}

export function WindowsWindowControls({
  isMaximized,
  onMinimize,
  onMaximize,
  onClose,
}: WindowsWindowControlsProps) {
  return (
    <>
      <button
        onClick={onMinimize}
        className="w-12 h-full flex items-center justify-center hover:bg-muted transition-colors"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onMaximize}
        className="w-12 h-full flex items-center justify-center hover:bg-muted transition-colors"
      >
        {isMaximized ? (
          <Copy className="h-3 w-3" />
        ) : (
          <Square className="h-3 w-3" />
        )}
      </button>
      <button
        onClick={onClose}
        className="w-12 h-full flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </>
  );
}
