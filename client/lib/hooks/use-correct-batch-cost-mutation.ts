import { useMutation } from "@tanstack/react-query";
import { correctBatchCostPrice } from "@/lib/db/queries/batch-cost-correction";

export function useCorrectBatchCostMutation() {
  return useMutation({
    mutationFn: ({ batchId, costPrice }: { batchId: string; costPrice: number }) =>
      correctBatchCostPrice(batchId, costPrice),
  });
}
