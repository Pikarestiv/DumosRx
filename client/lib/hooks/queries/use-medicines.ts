import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";
import { getProducts, getProductById, createProduct } from "@/lib/db/local-database";
import { update, softDelete } from "@/lib/db/base-helpers";

export function useProducts(page = 1, limit = 50, search = "") {
  return useQuery({
    queryKey: [...queryKeys.products(), { page, limit, search }],
    queryFn: () => getProducts(page, limit, search),
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: [...queryKeys.products(), id],
    queryFn: () => getProductById(id),
    enabled: !!id,
  });
}

export function useMutateProduct() {
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (data: any) => createProduct(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products() });
      queryClient.invalidateQueries({ queryKey: ['localData'] });
    },
  });

  const updateProduct = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => update("products", id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products() });
      queryClient.invalidateQueries({ queryKey: ['localData'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => softDelete("products", id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products() });
      queryClient.invalidateQueries({ queryKey: ['localData'] });
    },
  });

  return { create, update: updateProduct, remove };
}
