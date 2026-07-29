import { useQuery } from "@tanstack/react-query";
import { getProductList } from "@/lib/db/queries/products";
import { queryKeys } from "@/lib/query-keys";

export function useProductList() {
  return useQuery({
    ...queryKeys.products.list(),
    queryFn: () => getProductList()
  });
}
