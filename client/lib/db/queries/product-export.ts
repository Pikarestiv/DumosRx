import { query, getActiveStoreId } from "@/lib/db/local-database";
import { capitalizeWords } from "@/lib/hooks/use-uppercase-display";

export interface ExportableProduct {
  name: string;
  category: string;
  supplier: string;
  barcode: string;
  costPrice: number;
  sellingPrice: number;
  quantity: number;
  reorderLevel: number;
}

/**
 * One row per product. Supplier comes from whichever active batch happens to
 * be picked by SQLite's GROUP BY when a product has batches from more than
 * one supplier — acceptable for an export snapshot; batch-level supplier
 * detail is already visible in Batch Management.
 */
export async function getProductsForExport(
  productIds?: string[],
): Promise<ExportableProduct[]> {
  const storeId = getActiveStoreId();

  // Exports whatever the catalog table is currently showing (search/category/
  // status filters applied) rather than always the whole store — callers pass
  // the filtered id list when a filter is active, undefined otherwise.
  const idFilter =
    productIds && productIds.length > 0
      ? ` AND p.id IN (${productIds.map(() => "?").join(",")})`
      : "";

  // CSV/XLS is plain text — there's no CSS layer to uppercase it at render
  // time the way the in-app UI does, so the store's uppercase-display
  // preference has to be applied to the string itself here.
  const storeSettings = storeId
    ? await query<{ uppercase_display_enabled: number | null }>(
        "SELECT uppercase_display_enabled FROM stores WHERE id = ?",
        [storeId],
      )
    : [];
  const uppercaseNames = storeSettings[0]?.uppercase_display_enabled !== 0;

  const rows = await query<{
    name: string;
    category_name: string | null;
    supplier_name: string | null;
    barcode: string | null;
    cost_price: number | null;
    selling_price: number | null;
    stock_quantity: number | null;
    reorder_level: number | null;
  }>(
    `SELECT p.name, c.name as category_name, s.name as supplier_name, p.barcode,
       (SELECT AVG(sb.cost_price) FROM stock_batches sb WHERE sb.product_id = p.id AND sb._deleted = 0 AND sb.is_active = 1) as cost_price,
       p.selling_price,
       (SELECT SUM(sb.quantity) FROM stock_batches sb WHERE sb.product_id = p.id AND sb._deleted = 0 AND sb.is_active = 1) as stock_quantity,
       p.reorder_level
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN stock_batches sb2 ON sb2.product_id = p.id AND sb2._deleted = 0 AND sb2.is_active = 1
     LEFT JOIN suppliers s ON s.id = sb2.supplier_id
     WHERE p._deleted = 0${storeId ? " AND p.store_id = ?" : ""}${idFilter}
     GROUP BY p.id
     ORDER BY p.name ASC`,
    [...(storeId ? [storeId] : []), ...(productIds ?? [])],
  );

  const cased = (s: string) => (uppercaseNames ? s.toUpperCase() : capitalizeWords(s));

  return rows.map((r) => ({
    name: cased(r.name),
    category: r.category_name ? cased(r.category_name) : "",
    supplier: r.supplier_name || "",
    barcode: r.barcode || "",
    costPrice: r.cost_price || 0,
    sellingPrice: r.selling_price || 0,
    quantity: r.stock_quantity || 0,
    reorderLevel: r.reorder_level || 0,
  }));
}
