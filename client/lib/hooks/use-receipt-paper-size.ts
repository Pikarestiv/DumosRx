import { useState } from "react";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { useHydrated } from "@/lib/hooks/use-hydrated";

const PAPER_SIZE_KEY = STORAGE_KEYS.receiptPaperSize;

export type ReceiptPaperSize = "thermal" | "a4";

function readStoredPaperSize(): ReceiptPaperSize {
  try {
    const stored = localStorage.getItem(PAPER_SIZE_KEY);
    if (stored === "a4" || stored === "thermal") return stored;
  } catch {
    return "thermal";
  }
  return "thermal";
}

// Which physical paper the receipt prints to.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-receipt-paper-size-ts-L8
export function useReceiptPaperSize() {
  const hydrated = useHydrated();
  const [chosen, setChosen] = useState<ReceiptPaperSize | null>(null);
  const paperSize = chosen ?? (hydrated ? readStoredPaperSize() : "thermal");

  const setPaperSize = (value: ReceiptPaperSize) => {
    setChosen(value);
    try {
      localStorage.setItem(PAPER_SIZE_KEY, value);
    } catch {}
  };

  return { paperSize, setPaperSize };
}
