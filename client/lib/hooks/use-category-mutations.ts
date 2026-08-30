import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createCategory,
  renameCategory,
  deleteCategory,
  seedDefaultCategories,
} from "@/lib/db/queries/categories";
import { queryKeys } from "@/lib/query-keys";

function useInvalidateCategories() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.categories.list().queryKey });
    queryClient.invalidateQueries({ queryKey: queryKeys.categories.all().queryKey });
  };
}

export function useCreateCategoryMutation() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: (name: string) => createCategory(name),
    onSuccess: invalidate,
  });
}

interface RenameCategoryParams {
  id: string;
  name: string;
}

export function useRenameCategoryMutation() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: ({ id, name }: RenameCategoryParams) => renameCategory(id, name),
    onSuccess: invalidate,
  });
}

export function useDeleteCategoryMutation() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: invalidate,
  });
}

export function useSeedDefaultCategoriesMutation() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: () => seedDefaultCategories(),
    onSuccess: invalidate,
  });
}
