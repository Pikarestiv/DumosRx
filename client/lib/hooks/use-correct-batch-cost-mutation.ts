import { useMutation } from "@tanstack/react-query";
import { correctBatchCostPrice } from "@/lib/db/queries/batch-cost-correction";
import type { BatchCostReason } from "@/lib/constants/batch-cost-reasons";

export function useCorrectBatchCostMutation() {
  return useMutation({
    mutationFn: ({ batchId, costPrice, reason }: { batchId: string; costPrice: number; reason?: BatchCostReason }) =>
      correctBatchCostPrice(batchId, costPrice, reason),
  });
}
