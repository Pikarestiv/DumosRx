import { query } from "@/lib/db/local-database";
import { insert, update, softDelete } from "@/lib/db/base-helpers";

export interface CategoryRow {
  id: string;
  name: string;
}

/** All active categories, flat — matches how her current tool (Moniebook)
 * models categories, and avoids the cognitive overhead of a parent/child
 * tree for a business this size. A `parent_id` column exists on the table
 * (kept for potential future use) but nothing here reads or writes it. */
export async function getCategoryList(): Promise<CategoryRow[]> {
  return query<CategoryRow>(
    "SELECT id, name FROM categories WHERE _deleted = 0 AND (is_active IS NULL OR is_active = 1) ORDER BY name ASC",
  );
}

export async function createCategory(name: string) {
  const id = crypto.randomUUID();
  await insert("categories", {
    id,
    name: name.trim(),
    is_active: 1,
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

/** A pharmacy/general-store starter set matching the broad groupings
 * Cynthia's own Moniebook data uses (refs/MB-inventory-*.csv) — inserted
 * only when she explicitly asks for it via the management screen, never
 * automatically, so nothing appears or changes without her choosing it. */
export const DEFAULT_CATEGORIES = [
  "Drugs",
  "Beverages",
  "Toiletries",
  "Cosmetics",
  "Perfumes",
  "Wines & Spirits",
  "Provisions",
  "Biscuits",
  "Tea",
  "Groceries",
  "Baby Care",
];

export async function seedDefaultCategories() {
  const existing = await query<{ name: string }>(
    "SELECT name FROM categories WHERE _deleted = 0",
  );
  const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));
  const toCreate = DEFAULT_CATEGORIES.filter(
    (name) => !existingNames.has(name.toLowerCase()),
  );
  for (const name of toCreate) {
    await createCategory(name);
  }
  return toCreate.length;
}
