import { useQuery } from "@tanstack/react-query";
import { getProductList } from "@/lib/db/queries/products";

export function useProductList() {
  return useQuery({
    queryKey: ['productList'],
    queryFn: () => getProductList()
  });
}
