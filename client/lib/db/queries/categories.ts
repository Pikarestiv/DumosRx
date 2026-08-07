import { query } from "@/lib/db/local-database";
import { insert, update, softDelete } from "@/lib/db/base-helpers";

export interface CategoryRow {
  id: string;
  name: string;
  parent_id: string | null;
}

export interface CategoryTreeNode extends CategoryRow {
  children: CategoryRow[];
}

/** All active categories with their parent/child relationship intact, for
 * pickers and the category-management screen — top-level categories
 * (parent_id IS NULL) each carrying their own children array. Categories
 * created before parent_id existed default to standalone/top-level. */
export async function getCategoryTree(): Promise<CategoryTreeNode[]> {
  const rows = await query<CategoryRow>(
    "SELECT id, name, parent_id FROM categories WHERE _deleted = 0 AND (is_active IS NULL OR is_active = 1) ORDER BY name ASC",
  );

  const parents = rows.filter((r) => !r.parent_id);
  return parents.map((p) => ({
    ...p,
    children: rows.filter((r) => r.parent_id === p.id),
  }));
}

export async function createCategory(name: string, parentId: string | null = null) {
  const id = crypto.randomUUID();
  await insert("categories", {
    id,
    name: name.trim(),
    parent_id: parentId,
    is_active: 1,
    created_at: new Date().toISOString(),
  });
  return id;
}

export async function renameCategory(id: string, name: string) {
  await update("categories", id, { name: name.trim() });
}

export async function setCategoryParent(id: string, parentId: string | null) {
  await update("categories", id, { parent_id: parentId });
}

export async function deleteCategory(id: string) {
  await softDelete("categories", id);
}

/** A pharmacy/general-store starter set matching the broad groupings
 * Cynthia's own Moniebook data uses (refs/MB-inventory-*.csv) — inserted
 * only when she explicitly asks for it via the management screen, never
 * automatically, so nothing appears or changes without her choosing it. */
export const DEFAULT_PARENT_CATEGORIES = [
  "Drugs",
  "Beverages",
  "Toiletries",
  "Cosmetics",
  "Perfumes",
  "Wines & Spirits",
  "Groceries",
  "Baby Care",
];

export async function seedDefaultParentCategories() {
  const existing = await query<{ name: string }>(
    "SELECT name FROM categories WHERE _deleted = 0 AND parent_id IS NULL",
  );
  const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));
  const toCreate = DEFAULT_PARENT_CATEGORIES.filter(
    (name) => !existingNames.has(name.toLowerCase()),
  );
  for (const name of toCreate) {
    await createCategory(name, null);
  }
  return toCreate.length;
}
