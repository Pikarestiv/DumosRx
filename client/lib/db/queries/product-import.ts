import { query, transaction, getActiveStoreId, insert, update, createSupplier } from "@/lib/db/local-database";
import { getCategoryByName, getSupplierByName } from "@/lib/db/queries/products";
import { submitStockAudit, getAllActiveBatchesForProduct } from "@/lib/db/queries/inventory";
import { PRODUCT_IMPORT_REFERENCE_TYPE } from "@/lib/constants/stock-adjustments";
import type { ProductImportRow } from "@/lib/utils/product-import-export";
import { roundMoney } from "@/lib/utils/pos-calculations";

// Groups row indexes that would collide on import.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-product-import-L8
export function findInFileDuplicates(rows: ProductImportRow[]): number[][] {
  const byBarcode = new Map<string, number[]>();
  const byNameCategory = new Map<string, number[]>();

  rows.forEach((row, index) => {
    const barcode = row.barcode?.trim();
    if (barcode) {
      const key = `barcode::${barcode}`;
      const group = byBarcode.get(key);
      if (group) group.push(index);
      else byBarcode.set(key, [index]);
    }

    const nameKey = `name::${row.name.trim().toLowerCase()}::${(row.category || "").trim().toLowerCase()}`;
    const nameGroup = byNameCategory.get(nameKey);
    if (nameGroup) nameGroup.push(index);
    else byNameCategory.set(nameKey, [index]);
  });

  // Union-find: a row can belong to both a barcode group and a name+category group, and those two groups need merging whenever they share a row,…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-product-import-ts-L29
  const parent = rows.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (const group of byBarcode.values()) {
    for (let i = 1; i < group.length; i++) union(group[0], group[i]);
  }
  for (const group of byNameCategory.values()) {
    for (let i = 1; i < group.length; i++) union(group[0], group[i]);
  }

  const clusters = new Map<number, number[]>();
  rows.forEach((_, index) => {
    const root = find(index);
    const cluster = clusters.get(root);
    if (cluster) cluster.push(index);
    else clusters.set(root, [index]);
  });

  return [...clusters.values()].filter((group) => group.length > 1);
}

async function resolveCategoryId(name: string | undefined): Promise<string | undefined> {
  const trimmed = name?.trim();
  if (!trimmed) return undefined;
  const existing = await getCategoryByName(trimmed);
  if (existing) return existing;
  return await insert("categories", { name: trimmed });
}

async function resolveSupplierId(name: string | undefined): Promise<string | undefined> {
  const trimmed = name?.trim();
  if (!trimmed) return undefined;
  const existing = await getSupplierByName(trimmed);
  if (existing) return existing;
  return await createSupplier({ name: trimmed });
}

async function findExistingProductId(
  row: ProductImportRow,
): Promise<string | null> {
  const storeId = getActiveStoreId();
  if (row.barcode) {
    const byBarcode = await query<{ id: string }>(
      `SELECT id FROM products WHERE barcode = ? AND _deleted = 0${storeId ? " AND store_id = ?" : ""} LIMIT 1`,
      storeId ? [row.barcode, storeId] : [row.barcode],
    );
    if (byBarcode.length > 0) return byBarcode[0].id;
  }

  if (row.category) {
    const byNameAndCategory = await query<{ id: string }>(
      `SELECT p.id FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.name = ? COLLATE NOCASE AND c.name = ? COLLATE NOCASE AND p._deleted = 0${storeId ? " AND p.store_id = ?" : ""}
       LIMIT 1`,
      storeId ? [row.name, row.category, storeId] : [row.name, row.category],
    );
    if (byNameAndCategory.length > 0) return byNameAndCategory[0].id;

    // Falls through only to a still-categoryless row by the same name, never
    // to one with a different category (see docs/KNOWN_BUGS.md history).
    const byNameWithNullCategory = await query<{ id: string }>(
      `SELECT id FROM products WHERE name = ? COLLATE NOCASE AND category_id IS NULL AND _deleted = 0${storeId ? " AND store_id = ?" : ""} LIMIT 1`,
      storeId ? [row.name, storeId] : [row.name],
    );
    if (byNameWithNullCategory.length > 0) return byNameWithNullCategory[0].id;
    return null;
  }

  const byNameOnly = await query<{ id: string }>(
    `SELECT id FROM products WHERE name = ? COLLATE NOCASE AND _deleted = 0${storeId ? " AND store_id = ?" : ""} LIMIT 1`,
    storeId ? [row.name, storeId] : [row.name],
  );
  return byNameOnly[0]?.id ?? null;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: { row: number; reason: string }[];
  /** Matched products whose stock was also adjusted (only nonzero when
   * options.updateStockForMatched was set). */
  stockAdjusted: number;
}

// How often (in rows) to yield to the event loop during a bulk import.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-product-import-ts-L128
const YIELD_INTERVAL = 25;

// Upserts every row inside a single transaction.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-product-import-L139
export async function importProductRows(
  rows: ProductImportRow[],
  onProgress?: (completed: number, total: number) => void,
  options?: { updateStockForMatched?: boolean; performedBy?: string | null },
): Promise<ImportResult> {
  // The matched-stock branch below reconciles through submitStockAudit(), whose stock_audits.user_id is a constrained foreign key server-side —…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-product-import-ts-L143
  if (options?.updateStockForMatched && !options.performedBy) {
    throw new Error(
      "Importing stock for matched products requires a performing user",
    );
  }

  const result: ImportResult = { created: 0, updated: 0, skipped: [], stockAdjusted: 0 };
  // Collected during the main transaction, applied after it commits:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-product-import-ts-L158
  const matchedStockUpdates = new Map<string, { productId: string; quantity: number }>();

  await transaction(async () => {
    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        if (!row.name) {
          result.skipped.push({ row: i, reason: "Missing product name" });
          continue;
        }

        const categoryId = await resolveCategoryId(row.category);
        const existingId = await findExistingProductId(row);

        if (existingId) {
          await update("products", existingId, {
            name: row.name,
            ...(categoryId ? { category_id: categoryId } : {}),
            ...(row.sellingPrice !== undefined ? { selling_price: row.sellingPrice } : {}),
            ...(row.reorderLevel !== undefined ? { reorder_level: row.reorderLevel } : {}),
            ...(row.barcode ? { barcode: row.barcode } : {}),
            ...(row.showOnline !== undefined ? { show_online: row.showOnline ? 1 : 0 } : {}),
          });
          if (options?.updateStockForMatched && row.quantity !== undefined) {
            matchedStockUpdates.set(existingId, { productId: existingId, quantity: row.quantity });
          }
          // cost_price lives on stock_batches, not products - there's no column here to include in the update() above.
          // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-product-import-ts-L198
          if (row.costPrice !== undefined) {
            const activeBatches = await getAllActiveBatchesForProduct(existingId);
            if (activeBatches.length === 1) {
              await update("stock_batches", activeBatches[0].id, { cost_price: row.costPrice });
            }
          }
          result.updated++;
          continue;
        }

        const productId = await insert("products", {
          name: row.name,
          category_id: categoryId ?? null,
          selling_price: row.sellingPrice ?? 0,
          reorder_level: row.reorderLevel ?? 10,
          barcode: row.barcode ?? null,
          // Defaults off, matching the schema: a bulk import must not publish
          // a whole catalog to a public storefront unless the file says to.
          show_online: row.showOnline ? 1 : 0,
        });

        if (row.quantity !== undefined && row.quantity !== 0) {
          const supplierId = await resolveSupplierId(row.supplier);
          const batchId = await insert("stock_batches", {
            product_id: productId,
            batch_number: "Opening Stock",
            expiry_date: null,
            quantity: 0,
            cost_price: row.costPrice ?? null,
            supplier_id: supplierId ?? null,
            is_active: 1,
          });
          // The server never trusts stock_batches.quantity from a client payload (INSERT or UPDATE) — it's forced to 0 and re-derived by replaying stock…
          // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-product-import-ts-L239
          await insert("stock_movements", {
            product_id: productId,
            stock_batch_id: batchId,
            movement_type: "purchase",
            quantity: row.quantity,
            unit_cost: row.costPrice ?? null,
            total_cost: row.costPrice ? roundMoney(row.costPrice * row.quantity) : null,
            reference_type: PRODUCT_IMPORT_REFERENCE_TYPE,
            reason: "Bulk import - opening stock",
            performed_by: options?.performedBy ?? null,
            movement_date: new Date().toISOString(),
          });
        }

        result.created++;
      } finally {
        onProgress?.(i + 1, rows.length);
        if ((i + 1) % YIELD_INTERVAL === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    }
  });

  if (matchedStockUpdates.size > 0) {
    const updates = [...matchedStockUpdates.values()];
    const ids = updates.map((u) => u.productId);
    const systemQuantities = await query<{ id: string; qty: number | null }>(
      `SELECT p.id, (SELECT SUM(sb.quantity) FROM stock_batches sb WHERE sb.product_id = p.id AND sb._deleted = 0 AND sb.is_active = 1) as qty
       FROM products p WHERE p.id IN (${ids.map(() => "?").join(",")})`,
      ids,
    );
    const systemQtyById = new Map(systemQuantities.map((r) => [r.id, r.qty ?? 0]));
    result.stockAdjusted = updates.filter(
      (u) => (systemQtyById.get(u.productId) ?? 0) !== u.quantity,
    ).length;

    await submitStockAudit(
      updates.map((u) => ({
        productId: u.productId,
        systemQty: systemQtyById.get(u.productId) ?? 0,
        countedQty: u.quantity,
        reason: "Bulk import stock update",
      })),
      options?.performedBy as string,
      PRODUCT_IMPORT_REFERENCE_TYPE,
    );
  }

  return result;
}
