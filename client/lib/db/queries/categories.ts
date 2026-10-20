import { query } from "@/lib/db/local-database";
import { insert, update, softDelete } from "@/lib/db/base-helpers";
import { getActiveStoreId } from "@/lib/db/core";

export interface CategoryRow {
  id: string;
  name: string;
  productCount: number;
}

// All active categories, flat:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-categories-L11
export async function getCategoryList(): Promise<CategoryRow[]> {
  const storeId = getActiveStoreId();
  // Correlated subquery (not a LEFT JOIN + GROUP BY) so a category with zero products still returns exactly one row, and every other selected co…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-categories-ts-L15
  return query<CategoryRow>(
    `SELECT id, name,
       (SELECT COUNT(*) FROM products p WHERE p.category_id = categories.id AND p._deleted = 0${storeId ? " AND p.store_id = ?" : ""}) as productCount
     FROM categories
     WHERE _deleted = 0 AND (is_active IS NULL OR is_active = 1)${storeId ? " AND (store_id = ? OR store_id IS NULL)" : ""}
     ORDER BY name ASC`,
    storeId ? [storeId, storeId] : [],
  );
}

export async function createCategory(name: string) {
  const id = crypto.randomUUID();
  await insert("categories", {
    id,
    name: name.trim(),
    is_active: 1,
    store_id: getActiveStoreId(),
    created_at: new Date().toISOString(),
  });
  return id;
}

export async function renameCategory(id: string, name: string) {
  await update("categories", id, { name: name.trim() });
}

export async function deleteCategory(id: string) {
  await softDelete("categories", id);
}
