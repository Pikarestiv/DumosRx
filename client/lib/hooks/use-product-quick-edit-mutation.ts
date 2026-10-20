import { useMutation, useQueryClient } from "@tanstack/react-query";
import { insert, update } from "@/lib/db/local-database";
import { getCategoryByName } from "@/lib/db/queries/products";
import { queryKeys } from "@/lib/query-keys";

interface QuickEditProductParams {
  id: string;
  // Each field is independently optional:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-product-quick-edit-mutation-ts-L8
  sellingPrice?: number;
  reorderLevel?: number;
  category?: string;
}

// The product catalog table's inline "quick edit" cells patch selling price, reorder level, or category one at a time — a narrower mutation th…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-product-quick-edit-mutation-ts-L16
export function useQuickEditProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      sellingPrice,
      reorderLevel,
      category,
    }: QuickEditProductParams) => {
      const payload: Record<string, unknown> = {};
      if (sellingPrice !== undefined) payload.selling_price = sellingPrice;
      if (reorderLevel !== undefined) payload.reorder_level = reorderLevel;

      if (category !== undefined) {
        const categoryName = category.trim();
        let categoryId: string | null = null;
        if (categoryName) {
          categoryId = await getCategoryByName(categoryName);
          if (!categoryId) {
            categoryId = crypto.randomUUID();
            await insert("categories", {
              id: categoryId,
              name: categoryName,
              is_active: 1,
              created_at: new Date().toISOString(),
            });
          }
        }
        payload.category_id = categoryId;
      }

      return update("products", id, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories.list().queryKey });
    },
  });
}
