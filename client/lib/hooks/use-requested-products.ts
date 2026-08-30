import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getRequestedProducts,
  markRequestedProductAsOrdered,
  deleteRequestedProduct,
} from "@/lib/db/requested-products-queries";
import { queryKeys } from "@/lib/query-keys";

export function useRequestedProducts() {
  return useQuery({
    ...queryKeys.requestedProducts.all(),
    queryFn: () => getRequestedProducts("all"),
  });
}

export function useMarkRequestedProductAsOrderedMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markRequestedProductAsOrdered,
    onSuccess: () => {
      toast.success("Marked as ordered");
      queryClient.invalidateQueries(queryKeys.requestedProducts.all());
    },
    onError: (error) => {
      console.error("Failed to mark as ordered:", error);
      toast.error("An error occurred");
    },
  });
}

export function useDeleteRequestedProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRequestedProduct,
    onSuccess: () => {
      toast.success("Request removed");
      queryClient.invalidateQueries(queryKeys.requestedProducts.all());
    },
    onError: (error) => {
      console.error("Failed to delete request:", error);
      toast.error("An error occurred");
    },
  });
}
