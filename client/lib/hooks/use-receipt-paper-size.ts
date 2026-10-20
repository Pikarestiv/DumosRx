import { useEffect, useState } from "react";
import { STORAGE_KEYS } from "@/lib/storage-keys";

const PAPER_SIZE_KEY = STORAGE_KEYS.receiptPaperSize;

export type ReceiptPaperSize = "thermal" | "a4";

// Which physical paper the receipt prints to.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-receipt-paper-size-ts-L8
export function useReceiptPaperSize() {
  const [paperSize, setPaperSizeState] = useState<ReceiptPaperSize>("thermal");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PAPER_SIZE_KEY);
      if (stored === "a4" || stored === "thermal") setPaperSizeState(stored);
    } catch {
      // localStorage unavailable (e.g. SSR or private mode)
    }
  }, []);

  const setPaperSize = (value: ReceiptPaperSize) => {
    setPaperSizeState(value);
    try {
      localStorage.setItem(PAPER_SIZE_KEY, value);
    } catch {}
  };

  return { paperSize, setPaperSize };
}
