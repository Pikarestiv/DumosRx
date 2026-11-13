import { useEffect, useRef } from "react";

export const WEDGE_MAX_KEY_GAP_MS = 50;
export const WEDGE_MIN_CODE_LENGTH = 4;
export const WEDGE_TERMINATOR_KEYS: ReadonlySet<string> = new Set(["Enter", "Tab"]);
const OPEN_DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"]';

interface UseBarcodeWedgeOptions {
  onScan: (code: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  disabled?: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']") !== null;
}

export function useBarcodeWedge({ onScan, searchInputRef, disabled = false }: UseBarcodeWedgeOptions) {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (disabled) return;
    let buffer = "";
    let lastKeyAt = 0;

    const handleKeyDown = (event: KeyboardEvent) => {
      const now = Date.now();
      const withinBurst = now - lastKeyAt <= WEDGE_MAX_KEY_GAP_MS;

      if (
        event.ctrlKey || event.altKey || event.metaKey ||
        event.target === searchInputRef.current ||
        isEditableTarget(event.target) ||
        document.querySelector(OPEN_DIALOG_SELECTOR)
      ) {
        buffer = "";
        return;
      }

      if (WEDGE_TERMINATOR_KEYS.has(event.key)) {
        const code = buffer;
        buffer = "";
        if (code.length < WEDGE_MIN_CODE_LENGTH || !withinBurst) return;
        event.preventDefault();
        event.stopPropagation();
        onScanRef.current(code);
        return;
      }

      if (event.key.length !== 1) {
        if (event.key !== "Shift") buffer = "";
        return;
      }

      buffer = withinBurst ? buffer + event.key : event.key;
      lastKeyAt = now;
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [disabled, searchInputRef]);
}
