import { useMutation } from "@tanstack/react-query";
import { insert, update } from "@/lib/db/local-database";
import { getCategoryByName } from "@/lib/db/queries/products";
import type { NewProductPayload } from "@/lib/types/product";

interface SaveProductParams {
  payload: NewProductPayload;
}

export function useSaveProductMutation() {
  return useMutation({
    mutationFn: async ({ payload }: SaveProductParams) => {
      const isEditing = !!payload.id;

      // Create locally: is_active is already set correctly (0/1) by
      // AddProductDialog's submit handler, so just pass the payload through.
      const localPayload: NewProductPayload = { ...payload };

      // Resolve category string to UUID
      if (payload.category_id) {
        const categoryName = payload.category_id.trim();
        const categoryId = await getCategoryByName(categoryName);
        if (categoryId) {
          localPayload.category_id = categoryId;
        } else {
          const newId = crypto.randomUUID();
          await insert("categories", {
            id: newId,
            name: categoryName,
            is_active: 1,
            created_at: new Date().toISOString(),
          });
          localPayload.category_id = newId;
        }
      } else {
        localPayload.category_id = undefined;
      }

      if (isEditing) {
        const id = localPayload.id as string;
        delete localPayload.id;
        await update("products", id, localPayload);
      } else {
        await insert("products", localPayload);
      }

      return { isEditing };
    },
  });
}
