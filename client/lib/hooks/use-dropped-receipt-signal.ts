import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  dismissDroppedReceiptSignal,
  getDroppedReceiptSignal,
} from "@/lib/db/queries/procurement";
import { queryKeys } from "@/lib/query-keys";

/** A-26: reports an outstanding dropped receipt against this purchase order,
 * so the receiving screen can tell the store to re-check the received figure
 * instead of the shortfall staying silent until the next cycle count. */
export function useDroppedReceiptSignal(purchaseOrderId: string | null) {
  const queryClient = useQueryClient();
  const keys = queryKeys.purchaseOrders.droppedReceiptSignal(purchaseOrderId);

  const { data } = useQuery({
    ...keys,
    enabled: !!purchaseOrderId,
    queryFn: () => getDroppedReceiptSignal(purchaseOrderId as string),
  });

  const dismiss = async () => {
    if (!data) return;
    await dismissDroppedReceiptSignal(data.conflictIds);
    await queryClient.invalidateQueries({ queryKey: keys.queryKey });
  };

  return { signal: data ?? null, dismiss };
}
