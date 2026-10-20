import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSupplier, updateSupplier, deleteSupplier } from "@/lib/db/procurement";
import { update } from "@/lib/db/base-helpers";
import { queryKeys } from "@/lib/query-keys";
import type { SupplierPayload } from "@/lib/types/supplier";

// Shared by every "Add Supplier" call site (Procurement's new/edit PO pages, the Supplier Directory) so they all go through one mutation inste…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-supplier-mutations-ts-L7
export function useCreateSupplierMutation() {
  return useMutation({
    mutationFn: (payload: SupplierPayload) => createSupplier(payload),
  });
}

interface UpdateSupplierParams {
  id: string;
  payload: SupplierPayload;
}

export function useUpdateSupplierMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: UpdateSupplierParams) => updateSupplier(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries(queryKeys.suppliers.all());
    },
  });
}

export function useDeleteSupplierMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSupplier(id),
    onSuccess: () => {
      void queryClient.invalidateQueries(queryKeys.suppliers.all());
    },
  });
}

interface UpdateSupplierRatingParams {
  id: string;
  rating: number;
}

// The Supplier Directory table's inline "quick edit rating" affordance only ever patches this one field — a separate, narrower mutation than t…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-supplier-mutations-ts-L49
export function useUpdateSupplierRatingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rating }: UpdateSupplierRatingParams) => update("suppliers", id, { rating }),
    onSuccess: () => {
      void queryClient.invalidateQueries(queryKeys.suppliers.all());
    },
  });
}
