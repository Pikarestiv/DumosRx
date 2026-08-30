import { useMutation } from "@tanstack/react-query";
import { createSupplier } from "@/lib/db/procurement";
import type { SupplierPayload } from "@/lib/types/supplier";

/** Shared by every "Add Supplier" call site (Procurement's new/edit PO
 * pages, the Supplier Directory) so they all go through one mutation
 * instead of three separate copies of the same try/catch. Each caller
 * still supplies its own onSuccess/onError via mutate()'s second argument
 * for its own toast wording / dialog-closing / selection behavior — this
 * hook only owns the actual createSupplier() call and its pending state. */
export function useCreateSupplierMutation() {
  return useMutation({
    mutationFn: (payload: SupplierPayload) => createSupplier(payload),
  });
}
