import { useMutation, useQuery } from "@tanstack/react-query";
import {
  deleteProduct,
  getProductDeletionBlockers,
  type ProductDeletionBlockers,
} from "@/lib/db/queries/products";
import { queryKeys } from "@/lib/query-keys";

const NO_BLOCKERS: ProductDeletionBlockers = {
  stockOnHand: 0,
  openPurchaseOrders: 0,
};

/** Reads the two dependencies that stop a product being deleted, so the
 * confirmation dialog can say which one is in the way. deleteProduct()
 * re-checks them itself - this is for wording, not enforcement. */
export function useProductDeletionBlockers(productId: string | null) {
  const { data = NO_BLOCKERS, isPending } = useQuery({
    ...queryKeys.products.deletionBlockers(productId),
    queryFn: () => getProductDeletionBlockers(productId as string),
    enabled: !!productId,
  });

  return { blockers: data, isLoading: !!productId && isPending };
}

export function useDeleteProductMutation() {
  return useMutation({
    mutationFn: (id: string) => deleteProduct(id),
  });
}
