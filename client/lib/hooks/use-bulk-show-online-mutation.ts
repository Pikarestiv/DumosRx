import { useMutation } from "@tanstack/react-query";
import { setProductsShowOnline } from "@/lib/db/queries/product-visibility";

interface BulkShowOnlineParams {
  showOnline: boolean;
  /** The catalog table's currently-filtered ids, or undefined for every
   * product in the active store. */
  productIds?: string[];
}

/** Bulk publish/unpublish products on the public storefront. The per-product
 * switch in the add/edit dialog is the single-row equivalent. */
export function useBulkShowOnlineMutation() {
  return useMutation({
    mutationFn: ({ showOnline, productIds }: BulkShowOnlineParams) =>
      setProductsShowOnline(showOnline, productIds),
  });
}
