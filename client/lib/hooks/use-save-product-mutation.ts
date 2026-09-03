import { useMutation } from "@tanstack/react-query";
import { insert, update } from "@/lib/db/local-database";
import { getCategoryByName } from "@/lib/db/queries/products";
import type { NewProductPayload } from "@/lib/types/product";

interface SaveProductParams {
  payload: NewProductPayload;
}

/**
 * Extracted out of the useMutation call so it can be exercised directly in
 * a test against a real database (no React/QueryClient tree required) —
 * see __tests__/save-product-no-category.test.ts, a regression test for the
 * `category_id = undefined` bug below.
 */
export async function saveProductToLocalDb(payload: NewProductPayload) {
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
    // sql.js's bind() throws ("tried to bind a value of an unknown type
    // (undefined)") on a JS `undefined` parameter — it only accepts null
    // for a missing value. Category is optional (no "*" in the Add Product
    // dialog), so leaving it `undefined` here used to crash insert()/
    // update() for every product saved without one, surfacing as a silent
    // "Failed to save Product" toast with no row ever created.
    localPayload.category_id = null;
  }

  if (isEditing) {
    const id = localPayload.id as string;
    delete localPayload.id;
    await update("products", id, localPayload);
  } else {
    await insert("products", localPayload);
  }

  return { isEditing };
}

export function useSaveProductMutation() {
  return useMutation({
    mutationFn: ({ payload }: SaveProductParams) => saveProductToLocalDb(payload),
  });
}
