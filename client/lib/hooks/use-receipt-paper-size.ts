import { useEffect, useState } from "react";

const PAPER_SIZE_KEY = "receipt_paper_size";

export type ReceiptPaperSize = "thermal" | "a4";

/**
 * Which physical paper the receipt prints to. Defaults to thermal (58/80mm
 * roll) since that's what a POS terminal is printing to day-to-day; a store
 * owner who wants a standard-paper copy (e.g. for filing/invoicing) can
 * switch to A4 instead. Device-local: a receipt printer is a property of
 * the physical terminal, not the account.
 */
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
