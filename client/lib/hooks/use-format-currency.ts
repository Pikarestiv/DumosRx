import { useCallback } from "react";
import { useStore } from "@/lib/context/store-context";
import { formatCurrency } from "@/lib/utils";

export function useFormatCurrency() {
  const { storeProfile } = useStore();
  const currency = storeProfile?.currency;
  return useCallback((amount: number) => formatCurrency(amount, currency), [currency]);
}
