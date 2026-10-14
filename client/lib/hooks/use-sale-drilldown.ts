"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { getSaleByTransactionNumber } from "@/lib/db/queries/sales";
import type { SaleWithDetails } from "@/lib/types/sale";

/** Resolves a transaction number shown in a report row into the sale
 * TransactionDetailsDialog takes, so a row can open its line items. */
export function useSaleDrilldown() {
  const [sale, setSale] = useState<SaleWithDetails | null>(null);

  const openByReference = useCallback(async (reference: unknown) => {
    const transactionNumber =
      typeof reference === "string" ? reference.trim() : "";
    if (!transactionNumber) return;
    try {
      const found = await getSaleByTransactionNumber(transactionNumber);
      if (!found) {
        toast.error("Sale not found", {
          description: `No sale matches ${transactionNumber} on this device.`,
        });
        return;
      }
      setSale(found);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't open this sale", {
        description: "Something went wrong reading its items.",
      });
    }
  }, []);

  const close = useCallback(() => setSale(null), []);

  return { sale, openByReference, close };
}
