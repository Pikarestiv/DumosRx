import { useMutation } from "@tanstack/react-query";
import { correctBatchDetails, type BatchDetailsInput } from "@/lib/db/queries/batch-details-correction";

export function useCorrectBatchDetailsMutation() {
  return useMutation({
    mutationFn: ({ batchId, details }: { batchId: string; details: BatchDetailsInput }) =>
      correctBatchDetails(batchId, details),
  });
}
