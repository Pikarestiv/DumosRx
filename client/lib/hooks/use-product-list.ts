import { useQuery } from "@tanstack/react-query";
import { getProductList } from "@/lib/db/queries/products";
import { queryKeys } from "@/lib/query-keys";

// `enabled: false` lets a consumer that was handed a catalog from outside skip the query entirely rather than fetching the same full product l…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-product-list-ts-L5
export function useProductList({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    ...queryKeys.products.list(),
    queryFn: () => getProductList(),
    enabled,
  });
}
