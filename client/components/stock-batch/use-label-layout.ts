import { useState } from "react";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import {
  isLabelLayoutId,
  type LabelLayoutId,
} from "./barcode-label-sheet";

function readStoredLayout(): LabelLayoutId {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.labelPrintLayout);
    return isLabelLayoutId(stored) ? stored : "roll";
  } catch {
    return "roll";
  }
}

export function useLabelLayout() {
  const hydrated = useHydrated();
  const [chosen, setChosen] = useState<LabelLayoutId | null>(null);
  const layout = chosen ?? (hydrated ? readStoredLayout() : "roll");

  const setLayout = (value: LabelLayoutId) => {
    setChosen(value);
    try {
      localStorage.setItem(STORAGE_KEYS.labelPrintLayout, value);
    } catch {}
  };

  return { layout, setLayout };
}
