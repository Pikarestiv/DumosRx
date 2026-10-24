import { query, insert } from "@/lib/db/local-database";

interface SourceProductRow {
  id: string;
  name: string;
  generic_name: string | null;
  category_id: string | null;
  manufacturer: string | null;
  nafdac_number: string | null;
  dosage_form: string | null;
  strength: string | null;
  pack_size: string | null;
  unit_of_measure: string | null;
  description: string | null;
  indications: string | null;
  contraindications: string | null;
  side_effects: string | null;
  storage_conditions: string | null;
  selling_price: number | null;
  requires_prescription: number | null;
  is_controlled: number | null;
  barcode: string | null;
  base_unit: string | null;
  bulk_unit: string | null;
  units_per_bulk: number | null;
}

export async function getSourceProduct(
  productId: string,
  sourceStoreId: string,
): Promise<SourceProductRow | null> {
  const rows = await query<SourceProductRow>(
    `SELECT * FROM products WHERE id = ? AND _deleted = 0 AND store_id = ? LIMIT 1`,
    [productId, sourceStoreId],
  );
  return rows[0] ?? null;
}

// Mirrors findExistingProductId's precedence in product-import.ts (barcode -> name+category -> name), just scoped to an explicit destStoreId i…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-stock-transfers-ts-L103
export async function findDestProductId(
  product: SourceProductRow,
  destStoreId: string,
): Promise<string | null> {
  if (product.barcode) {
    const byBarcode = await query<{ id: string }>(
      `SELECT id FROM products WHERE barcode = ? AND _deleted = 0 AND store_id = ? LIMIT 1`,
      [product.barcode, destStoreId],
    );
    if (byBarcode.length > 0) return byBarcode[0].id;
  }

  let categoryName: string | null = null;
  if (product.category_id) {
    const cat = await query<{ name: string }>(
      `SELECT name FROM categories WHERE id = ?`,
      [product.category_id],
    );
    categoryName = cat[0]?.name ?? null;
  }

  if (categoryName) {
    const byNameAndCategory = await query<{ id: string }>(
      `SELECT p.id FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.name = ? COLLATE NOCASE AND c.name = ? COLLATE NOCASE AND p._deleted = 0 AND p.store_id = ?
       LIMIT 1`,
      [product.name, categoryName, destStoreId],
    );
    if (byNameAndCategory.length > 0) return byNameAndCategory[0].id;
  }

  const byNameOnly = await query<{ id: string }>(
    `SELECT id FROM products WHERE name = ? COLLATE NOCASE AND _deleted = 0 AND store_id = ? LIMIT 1`,
    [product.name, destStoreId],
  );
  return byNameOnly[0]?.id ?? null;
}

async function resolveDestCategoryId(
  categoryId: string | null,
  destStoreId: string,
): Promise<string | null> {
  if (!categoryId) return null;
  const source = await query<{ name: string }>(
    `SELECT name FROM categories WHERE id = ?`,
    [categoryId],
  );
  const name = source[0]?.name;
  if (!name) return null;

  const existing = await query<{ id: string }>(
    `SELECT id FROM categories WHERE name = ? COLLATE NOCASE AND _deleted = 0 AND (store_id = ? OR store_id IS NULL) LIMIT 1`,
    [name, destStoreId],
  );
  if (existing.length > 0) return existing[0].id;

  return await insert(
    "categories",
    { name, store_id: destStoreId },
    { storeId: destStoreId },
  );
}

// Creates the destination-store product row the first time a product is transferred to a store that's never carried it before.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-stock-transfers-L210
export async function createDestProduct(
  product: SourceProductRow,
  destStoreId: string,
): Promise<string> {
  const destCategoryId = await resolveDestCategoryId(
    product.category_id,
    destStoreId,
  );

  return await insert(
    "products",
    {
      name: product.name,
      generic_name: product.generic_name ?? null,
      category_id: destCategoryId,
      manufacturer: product.manufacturer ?? null,
      nafdac_number: product.nafdac_number ?? null,
      dosage_form: product.dosage_form ?? null,
      strength: product.strength ?? null,
      pack_size: product.pack_size ?? null,
      unit_of_measure: product.unit_of_measure ?? null,
      description: product.description ?? null,
      indications: product.indications ?? null,
      contraindications: product.contraindications ?? null,
      side_effects: product.side_effects ?? null,
      storage_conditions: product.storage_conditions ?? null,
      selling_price: product.selling_price ?? 0,
      requires_prescription: product.requires_prescription ?? 0,
      is_controlled: product.is_controlled ?? 0,
      barcode: product.barcode ?? null,
      base_unit: product.base_unit ?? "Unit",
      bulk_unit: product.bulk_unit ?? null,
      units_per_bulk: product.units_per_bulk ?? 1,
      store_id: destStoreId,
    },
    { storeId: destStoreId },
  );
}
