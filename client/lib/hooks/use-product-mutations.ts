import { useMutation } from "@tanstack/react-query";
import { createProduct } from "@/lib/db/local-database";
import type { NewProductPayload } from "@/lib/types/product";

// Shared by every "quick add product" call site (Procurement's new/edit PO pages) so they go through one mutation instead of separate copies o…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-product-mutations-ts-L5
export function useCreateProductMutation() {
  return useMutation({
    mutationFn: (payload: NewProductPayload) => createProduct(payload),
  });
}
