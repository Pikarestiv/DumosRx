import { useMutation } from "@tanstack/react-query";
import { createProduct } from "@/lib/db/local-database";
import type { NewProductPayload } from "@/lib/types/product";

/** Shared by every "quick add product" call site (Procurement's new/edit PO
 * pages) so they go through one mutation instead of separate copies of the
 * same try/catch. Each caller supplies its own onSuccess/onError for its own
 * toast wording / refetch / selection behavior. */
export function useCreateProductMutation() {
  return useMutation({
    mutationFn: (payload: NewProductPayload) => createProduct(payload),
  });
}
