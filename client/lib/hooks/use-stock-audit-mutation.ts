import { useMutation, useQueryClient } from "@tanstack/react-query";
import { submitStockAudit } from "@/lib/db/queries/inventory";
import { queryKeys } from "@/lib/query-keys";
import type { StockAuditSubmission } from "@/lib/db/queries/inventory";

interface SubmitStockAuditParams {
  items: StockAuditSubmission[];
  performedBy: string | null;
}

export function useSubmitStockAuditMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ items, performedBy }: SubmitStockAuditParams) =>
      submitStockAudit(items, performedBy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.withDetails().queryKey });
      queryClient.invalidateQueries({ queryKey: queryKeys.stockAudits.all().queryKey });
    },
  });
}
