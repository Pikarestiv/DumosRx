import { useMutation } from "@tanstack/react-query";
import { update } from "@/lib/db/local-database";

interface QuickEditProductParams {
  id: string;
  sellingPrice: number;
  reorderLevel: number;
}

/** The product catalog table's inline "quick edit" row only ever patches
 * selling price and reorder level — a narrower mutation than the full
 * add/edit product dialog's payload. */
export function useQuickEditProductMutation() {
  return useMutation({
    mutationFn: ({ id, sellingPrice, reorderLevel }: QuickEditProductParams) =>
      update("products", id, {
        selling_price: sellingPrice,
        reorder_level: reorderLevel,
      }),
  });
}
