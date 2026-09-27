import { query } from "@/lib/db/local-database";
import { insert, update, softDelete } from "@/lib/db/base-helpers";
import { getActiveStoreId } from "@/lib/db/core";

export interface CategoryRow {
  id: string;
  name: string;
  productCount: number;
}

/** All active categories, flat: matches how her current tool (Moniebook)
 * models categories, and avoids the cognitive overhead of a parent/child
 * tree for a business this size. A `parent_id` column exists on the table
 * (kept for potential future use) but nothing here reads or writes it.
 *
 * Store-scoped like the rest of the domain tables (see customers.ts /
 * products.ts for the same pattern), with one deliberate difference: rows
 * with a NULL store_id (categories created before store_id existed on this
 * table, or left unbackfilled) stay visible to every store rather than
 * being filtered out, so a device that already has real data doesn't
 * suddenly lose access to categories it was using. New categories always
 * get a store_id (see createCategory), so NULL rows only ever come from
 * pre-fix history, not from an ongoing gap. */
export async function getCategoryList(): Promise<CategoryRow[]> {
  const storeId = getActiveStoreId();
  // Correlated subquery (not a LEFT JOIN + GROUP BY) so a category with zero
  // products still returns exactly one row, and every other selected column
  // stays a plain scalar instead of needing MAX()/ANY_VALUE() workarounds.
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
