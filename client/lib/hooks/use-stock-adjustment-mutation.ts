import { useMutation, useQueryClient } from "@tanstack/react-query";
import { submitStockAdjustment } from "@/lib/db/queries/inventory";
import { queryKeys } from "@/lib/query-keys";
import {
  buildAdjustmentReason,
  resolveAdjustmentDelta,
  type AdjustmentReasonValue,
} from "@/components/stock-batch/adjustment-derivations";
import type { AdjustmentDraftItem } from "@/components/stock-batch/adjustment-items-step";

interface SubmitStockAdjustmentParams {
  items: AdjustmentDraftItem[];
  reason: AdjustmentReasonValue;
  note?: string;
  performedBy: string | null;
}

/** Turns a draft (a fixed reason, an optional note, and per-item quantities
 * entered as plain positive numbers) into the signed deltas the DB layer
 * writes. The note rides in `reason` behind a separator - stock_movements has
 * no note column (see adjustment-derivations.ts). */
export function useSubmitStockAdjustmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ items, reason, note, performedBy }: SubmitStockAdjustmentParams) =>
      submitStockAdjustment(
        items.map((item) => ({
          productId: item.productId,
          delta: resolveAdjustmentDelta(reason, item.quantity),
          unitCost: item.unitCost,
        })),
        { reason: buildAdjustmentReason(reason, note), performedBy },
      ),
    // Both ledgers self-invalidate: their keys are tagged with the
    // stock_movements table, which insert() invalidates by meta.tables.
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.products.withDetails().queryKey,
      });
    },
  });
}
