import { useQuery } from "@tanstack/react-query";
import { getOutstandingBackorders, type OutstandingBackorder } from "@/lib/db/queries/backorders";
import { queryKeys } from "@/lib/query-keys";

const NONE: OutstandingBackorder[] = [];

export function useOutstandingBackorders(productIds?: string[], enabled = true) {
  const { data } = useQuery({
    ...queryKeys.stockBatches.outstandingBackorders(productIds),
    queryFn: () => getOutstandingBackorders(productIds),
    enabled: enabled && (productIds === undefined || productIds.length > 0),
  });
  return data ?? NONE;
}
