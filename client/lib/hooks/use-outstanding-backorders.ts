import { useContext } from "react";
import { useQuery, QueryClientContext, QueryClient } from "@tanstack/react-query";
import { getOutstandingBackorders, type OutstandingBackorder } from "@/lib/db/queries/backorders";
import { queryKeys } from "@/lib/query-keys";

const NONE: OutstandingBackorder[] = [];
const FALLBACK_CLIENT = new QueryClient({
  defaultOptions: { queries: { enabled: false, retry: false } },
});

export function useOutstandingBackorders(productIds?: string[], enabled = true) {
  const contextClient = useContext(QueryClientContext);
  const client = contextClient ?? FALLBACK_CLIENT;
  const isEnabled = Boolean(contextClient) && enabled && (productIds === undefined || productIds.length > 0);

  const { data } = useQuery(
    {
      ...queryKeys.stockBatches.outstandingBackorders(productIds),
      queryFn: () => getOutstandingBackorders(productIds),
      enabled: isEnabled,
    },
    client,
  );
  return data ?? NONE;
}
