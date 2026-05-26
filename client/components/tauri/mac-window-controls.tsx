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
        className="w-3.5 h-3.5 rounded-full bg-[#ff5f57] border border-black/10 flex items-center justify-center relative cursor-default"
        aria-label="Close"
      >
        <MacCloseIcon className="w-3.5 h-3.5 text-[#4c0002] opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
      <button
        onClick={onMinimize}
        className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] border border-black/10 flex items-center justify-center relative cursor-default"
        aria-label="Minimize"
      >
        <MacMinimizeIcon className="w-3.5 h-3.5 text-[#5c3e00] opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
      <button
        onClick={onMaximize}
        className="w-3.5 h-3.5 rounded-full bg-[#28c940] border border-black/10 flex items-center justify-center relative cursor-default"
        aria-label="Maximize"
      >
        <MacMaximizeIcon className="w-3.5 h-3.5 text-[#005000] opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    </>
  );
}
