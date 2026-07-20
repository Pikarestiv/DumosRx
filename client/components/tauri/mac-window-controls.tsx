import React from "react";
import { MacCloseIcon, MacMinimizeIcon, MacMaximizeIcon } from "./icons";

interface MacWindowControlsProps {
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
}

export function MacWindowControls({
  onClose,
  onMinimize,
  onMaximize,
}: MacWindowControlsProps) {
  return (
    <>
      <button
        onClick={onClose}
        className="w-3.5 h-3.5 rounded-full bg-mac-close-btn border border-black/10 flex items-center justify-center relative cursor-default"
        aria-label="Close"
      >
        <MacCloseIcon className="w-3.5 h-3.5 text-mac-close-icon opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
      <button
        onClick={onMinimize}
        className="w-3.5 h-3.5 rounded-full bg-mac-min-btn border border-black/10 flex items-center justify-center relative cursor-default"
        aria-label="Minimize"
      >
        <MacMinimizeIcon className="w-3.5 h-3.5 text-mac-min-icon opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
      <button
        onClick={onMaximize}
        className="w-3.5 h-3.5 rounded-full bg-mac-max-btn border border-black/10 flex items-center justify-center relative cursor-default"
        aria-label="Maximize"
      >
        <MacMaximizeIcon className="w-3.5 h-3.5 text-mac-max-icon opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    </>
  );
}
